import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';

import { PromptQueue } from '../../agent/chat/prompt-queue';
import { readRecentSessions } from '../../agent/logging/session-log';
import { startChatSession, type ChatSessionHandle } from '../../agent/orchestrator/run-chat';
import {
  deleteProvider,
  listProviders,
  setActiveProvider,
  upsertProvider,
} from '../../agent/providers/config-store';
import { PROVIDER_PRESETS } from '../../agent/providers/presets';
import { testProviderConnection } from '../../agent/providers/test-connection';
import { scanAllSkills } from '../../agent/skills/skill-scanner';
import type {
  ChatEvent,
  ChatStartOutcome,
  REnvStatus,
  TranscriptEntryPersisted,
} from '../../shared/ipc';
import type { ProviderRecord } from '../../shared/providers';

const isDev = !app.isPackaged;

interface ActiveSession {
  handle: ChatSessionHandle;
  queue: PromptQueue;
  abortController: AbortController;
}
const activeSessions = new Map<string, ActiveSession>();

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'right' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function registerIpc(): void {
  ipcMain.handle('app:ping', () => ({
    pong: true,
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  }));

  ipcMain.handle(
    'chat:start',
    async (event: IpcMainInvokeEvent, firstMessage: unknown): Promise<ChatStartOutcome> => {
      if (typeof firstMessage !== 'string' || !firstMessage.trim()) {
        throw new Error('chat:start needs a non-empty firstMessage string');
      }

      const sessionId = randomUUID();
      const abortController = new AbortController();
      const queue = new PromptQueue();

      const sender = event.sender;
      const channel = `chat:event:${sessionId}`;
      const push = (ev: ChatEvent): void => {
        if (sender.isDestroyed()) return;
        sender.send(channel, ev);
      };

      const handle = await startChatSession({
        sessionId,
        firstMessage: firstMessage.trim(),
        queue,
        onEvent: push,
        signal: abortController.signal,
      });

      activeSessions.set(sessionId, { handle, queue, abortController });

      void handle.done.finally(() => {
        activeSessions.delete(sessionId);
      });

      return { sessionId };
    },
  );

  ipcMain.handle('chat:send', (_event, sessionId: unknown, text: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error('chat:send needs a non-empty sessionId');
    }
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('chat:send needs a non-empty text');
    }
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`chat:send cannot find session ${sessionId}`);
    }
    session.handle.sendUserMessage(text.trim());
  });

  ipcMain.handle('chat:cancel', (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const session = activeSessions.get(sessionId);
    if (!session) return;
    session.handle.cancel('user_cancel');
    session.abortController.abort();
  });

  ipcMain.handle('providers:list', () => listProviders());

  ipcMain.handle('providers:upsert', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    await upsertProvider(record);
  });

  ipcMain.handle('providers:delete', async (_event, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('providers:delete needs a non-empty id');
    await deleteProvider(id);
  });

  ipcMain.handle('providers:setActive', async (_event, id: string | null) => {
    if (id !== null && (typeof id !== 'string' || !id)) {
      throw new Error('providers:setActive expects a non-empty string or null');
    }
    await setActiveProvider(id);
  });

  ipcMain.handle('providers:presets', () => PROVIDER_PRESETS);

  ipcMain.handle('providers:test', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    return testProviderConnection(record);
  });

  ipcMain.handle('sessions:recent', async (_event, limit?: number) => {
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 100;
    return readRecentSessions(n);
  });
  ipcMain.handle('sessions:transcript', async (_event, sessionId: string) =>
    readSessionTranscript(sessionId),
  );
  ipcMain.handle(
    'sessions:persistTranscript',
    async (
      _event,
      payload: { sessionId: string; entries: TranscriptEntryPersisted[] },
    ): Promise<void> => {
      await persistSessionTranscript(payload.sessionId, payload.entries);
    },
  );

  ipcMain.handle('skills:list', () => scanAllSkills());
  ipcMain.handle('rEnv:check', async (): Promise<REnvStatus> => checkREnv());
}

function resolveTranscriptPath(sessionId: string): string {
  return join(app.getPath('userData'), 'sessions', `${sessionId}.jsonl`);
}

async function readSessionTranscript(sessionId: string): Promise<TranscriptEntryPersisted[]> {
  if (!sessionId.trim()) return [];
  const filePath = resolveTranscriptPath(sessionId);
  try {
    const content = await readFile(filePath, 'utf8');
    const entries: TranscriptEntryPersisted[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as TranscriptEntryPersisted);
      } catch (error) {
        console.warn('failed to parse transcript line', { sessionId, error });
      }
    }
    return entries;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return [];
    throw error;
  }
}

async function persistSessionTranscript(
  sessionId: string,
  entries: TranscriptEntryPersisted[],
): Promise<void> {
  if (!sessionId.trim()) return;
  const filePath = resolveTranscriptPath(sessionId);
  await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true });
  const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
  await writeFile(filePath, body ? `${body}\n` : '', 'utf8');
}

function validateProviderRecord(record: unknown): asserts record is ProviderRecord {
  if (!record || typeof record !== 'object') {
    throw new Error('provider record must be an object');
  }
  const r = record as Record<string, unknown>;
  const requiredStrings: (keyof ProviderRecord)[] = [
    'id',
    'label',
    'protocol',
    'baseURL',
    'model',
    'authMode',
    'credential',
  ];
  for (const key of requiredStrings) {
    if (typeof r[key] !== 'string') {
      throw new Error(`provider.${String(key)} must be a string`);
    }
  }
  if (!(r.id as string).trim()) throw new Error('provider.id cannot be empty');
  if (r.protocol !== 'anthropic' && r.protocol !== 'openai') {
    throw new Error(`provider.protocol must be anthropic | openai, got ${String(r.protocol)}`);
  }
  if (r.authMode !== 'api_key' && r.authMode !== 'auth_token') {
    throw new Error(`provider.authMode must be api_key | auth_token, got ${String(r.authMode)}`);
  }
}

async function checkREnv(): Promise<REnvStatus> {
  return new Promise((resolve) => {
    const child = spawn('Rscript', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        available: false,
        error: 'Rscript --version 超时（>3s）',
      });
    }, 3000);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        available: false,
        error: err.code === 'ENOENT' ? '未在 PATH 中找到 Rscript' : err.message,
      });
    });
    child.once('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const version = (stderr || stdout).trim().split(/\r?\n/)[0]?.trim();
      if (code === 0 && version) {
        const path = await resolveRscriptPath();
        resolve({
          available: true,
          version,
          path,
        });
        return;
      }

      resolve({
        available: false,
        error: version || `Rscript 退出码 ${code ?? 'unknown'}`,
      });
    });
  });
}

async function resolveRscriptPath(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where.exe' : 'which', ['Rscript'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.once('error', () => resolve(undefined));
    child.once('close', () => {
      const line = output.trim().split(/\r?\n/)[0]?.trim();
      resolve(line || undefined);
    });
  });
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const session of activeSessions.values()) {
    session.handle.cancel('user_cancel');
    session.abortController.abort();
  }
  activeSessions.clear();
});
