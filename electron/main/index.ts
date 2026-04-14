import { randomUUID } from 'node:crypto';
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
import type { ChatEvent, ChatStartOutcome } from '../../shared/ipc';
import type { ProviderRecord } from '../../shared/providers';

const isDev = !app.isPackaged;

// 每个 sessionId 对应一个 ChatSessionHandle + AbortController，
// 用于 send / cancel 以及进程退出时的 cleanup。
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
  // Phase 0 最小 IPC 证明：ping → pong
  ipcMain.handle('app:ping', () => ({
    pong: true,
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  }));

  // ---- Phase 3: 多轮 chat 会话 --------------------------------------------
  ipcMain.handle(
    'chat:start',
    async (
      event: IpcMainInvokeEvent,
      firstMessage: unknown,
    ): Promise<ChatStartOutcome> => {
      if (typeof firstMessage !== 'string' || !firstMessage.trim()) {
        throw new Error('chat:start 需要非空 firstMessage string');
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

      // 会话主循环一旦跑完就把注册项清掉，避免内存泄漏。
      void handle.done.finally(() => {
        activeSessions.delete(sessionId);
      });

      return { sessionId };
    },
  );

  ipcMain.handle('chat:send', (_event, sessionId: unknown, text: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error('chat:send 需要非空 sessionId');
    }
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('chat:send 需要非空 text');
    }
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`chat:send 找不到会话 ${sessionId}`);
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

  // ---- Phase 2: providers CRUD --------------------------------------------
  ipcMain.handle('providers:list', () => listProviders());

  ipcMain.handle('providers:upsert', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    await upsertProvider(record);
  });

  ipcMain.handle('providers:delete', async (_event, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('providers:delete 需要非空 id');
    await deleteProvider(id);
  });

  ipcMain.handle('providers:setActive', async (_event, id: string | null) => {
    if (id !== null && (typeof id !== 'string' || !id)) {
      throw new Error('providers:setActive 参数必须是非空 string 或 null');
    }
    await setActiveProvider(id);
  });

  ipcMain.handle('providers:presets', () => PROVIDER_PRESETS);

  ipcMain.handle('providers:test', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    return testProviderConnection(record);
  });

  // ---- Phase 3: session history -------------------------------------------
  ipcMain.handle('sessions:recent', async (_event, limit?: number) => {
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 100;
    return readRecentSessions(n);
  });

  // ---- Phase 3: skill 列表 ------------------------------------------------
  ipcMain.handle('skills:list', () => scanAllSkills());
}

// renderer 送上来的任意 JSON 都得在 main 里校验一次，不能信 renderer 的类型标注。
function validateProviderRecord(record: unknown): asserts record is ProviderRecord {
  if (!record || typeof record !== 'object') {
    throw new Error('provider record 必须是对象');
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
      throw new Error(`provider.${String(key)} 必须是 string`);
    }
  }
  if (!(r.id as string).trim()) throw new Error('provider.id 不能为空');
  if (r.protocol !== 'anthropic' && r.protocol !== 'openai') {
    throw new Error(`provider.protocol 必须是 anthropic | openai，收到 ${String(r.protocol)}`);
  }
  if (r.authMode !== 'api_key' && r.authMode !== 'auth_token') {
    throw new Error(`provider.authMode 必须是 api_key | auth_token，收到 ${String(r.authMode)}`);
  }
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
