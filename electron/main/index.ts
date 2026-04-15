import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron';

import { coaseAppUpdater } from './app-updater';
import { PromptQueue } from '../../agent/chat/prompt-queue';
import {
  appendSessionLog,
  deleteSessionLog,
  readRecentSessions,
  sealOrphanedSessions,
} from '../../agent/logging/session-log';
import type { SessionLogEntry } from '../../shared/runs';
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
  AttachedPath,
  AttachmentKind,
  ChatMessageInput,
  ChatEvent,
  ChatResumeInput,
  ChatStartOutcome,
  REnvStatus,
  RunInsightsPersisted,
  TranscriptEntryPersisted,
  WorkspaceFilePreview,
  WorkspaceTreeNode,
} from '../../shared/ipc';
import type { ProviderRecord } from '../../shared/providers';

const isDev = !app.isPackaged;

interface ActiveSession {
  handle: ChatSessionHandle;
  queue: PromptQueue;
  abortController: AbortController;
  workspaceRoot: string;
}

interface ChatEventStream {
  sender: Electron.WebContents;
  channel: string;
  attached: boolean;
  buffer: ChatEvent[];
}

const activeSessions = new Map<string, ActiveSession>();
const chatEventStreams = new Map<string, ChatEventStream>();

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#171717',
      height: 40,
    },
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

  ipcMain.handle('updates:getState', () => coaseAppUpdater.getState());
  ipcMain.handle('updates:check', () => coaseAppUpdater.check());
  ipcMain.handle('updates:download', () => coaseAppUpdater.download());
  ipcMain.handle('updates:install', () => {
    coaseAppUpdater.install();
  });

  ipcMain.handle(
    'chat:start',
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ChatStartOutcome> => {
      const message = validateChatMessageInput(payload, 'chat:start');
      if (!message.text.trim()) {
        throw new Error('chat:start needs a non-empty message');
      }
      return openChatSession(
        event,
        message.displayText?.trim() || message.text.trim(),
        withLocalContext(message.text.trim(), message.attachments, message.workspaceRoot),
        true,
        message.workspaceRoot,
      );
    },
  );

  ipcMain.handle(
    'chat:resume',
    async (event: IpcMainInvokeEvent, payload: ChatResumeInput): Promise<ChatStartOutcome> => {
      validateResumePayload(payload);
      const guidance = payload.guidance.trim();
      return openChatSession(
        event,
        payload.displayGuidance?.trim() || guidance,
        withLocalContext(guidance, payload.attachments, payload.workspaceRoot),
        false,
        payload.workspaceRoot,
        payload.sdkSessionId.trim(),
      );
    },
  );

  ipcMain.handle('chat:send', (_event, sessionId: unknown, payload: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error('chat:send needs a non-empty sessionId');
    }
    const message = validateChatMessageInput(payload, 'chat:send');
    const session = activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`chat:send cannot find session ${sessionId}`);
    }
    session.handle.sendUserMessage(
      message.displayText?.trim() || message.text.trim(),
      withLocalContext(message.text.trim(), message.attachments, session.workspaceRoot),
    );
  });

  ipcMain.handle('chat:cancel', (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const session = activeSessions.get(sessionId);
    if (!session) return;
    session.handle.cancel('user_cancel');
    session.abortController.abort();
  });

  ipcMain.handle('chat:interrupt', (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const session = activeSessions.get(sessionId);
    if (!session) return;
    session.handle.cancel('user_interrupt');
    session.abortController.abort();
  });

  ipcMain.handle('chat:attach', (_event, sessionId: unknown): ChatEvent[] => {
    if (typeof sessionId !== 'string' || !sessionId) return [];
    const stream = chatEventStreams.get(sessionId);
    if (!stream) return [];
    stream.attached = true;
    const backlog = [...stream.buffer];
    stream.buffer.length = 0;
    return backlog;
  });

  ipcMain.handle('chat:detach', (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const stream = chatEventStreams.get(sessionId);
    if (!stream) return;
    stream.attached = false;
  });

  ipcMain.handle('providers:list', () => listProviders());
  ipcMain.handle('providers:presets', () => PROVIDER_PRESETS);

  ipcMain.handle('providers:upsert', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    await upsertProvider(record);
  });

  ipcMain.handle('providers:delete', async (_event, id: string) => {
    if (typeof id !== 'string' || !id) {
      throw new Error('providers:delete needs a non-empty id');
    }
    await deleteProvider(id);
  });

  ipcMain.handle('providers:setActive', async (_event, id: string | null) => {
    if (id !== null && (typeof id !== 'string' || !id)) {
      throw new Error('providers:setActive expects a non-empty string or null');
    }
    await setActiveProvider(id);
  });

  ipcMain.handle('providers:test', async (_event, record: ProviderRecord) => {
    validateProviderRecord(record);
    return testProviderConnection(record);
  });

  ipcMain.handle('sessions:recent', async (_event, limit?: number) => {
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 100;
    return readRecentSessions(n);
  });
  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => deleteSession(sessionId));

  ipcMain.handle('sessions:transcript', async (_event, sessionId: string) =>
    readSessionTranscript(sessionId),
  );
  ipcMain.handle('sessions:insights', async (_event, sessionId: string) =>
    readSessionInsights(sessionId),
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

  ipcMain.handle(
    'sessions:persistInsights',
    async (
      _event,
      payload: { sessionId: string; insights: RunInsightsPersisted },
    ): Promise<void> => {
      await persistSessionInsights(payload.sessionId, payload.insights);
    },
  );

  ipcMain.handle('artifacts:openPath', async (_event, filePath: string) => openArtifactPath(filePath));

  ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('window:toggleMaximize', (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }
    window.maximize();
  });
  ipcMain.handle('window:toggleDevTools', (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools();
      return;
    }
    window.webContents.openDevTools({ mode: 'right' });
  });
  ipcMain.handle('window:close', (event: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('skills:list', () => scanAllSkills());
  ipcMain.handle('rEnv:check', async (): Promise<REnvStatus> => checkREnv());
  ipcMain.handle('files:pick', (event, kind: AttachmentKind) =>
    pickPathsForAttachment(event, kind),
  );
  ipcMain.handle('workspaces:pickDirectory', (event) => pickWorkspaceDirectory(event));
  ipcMain.handle('workspaces:getRoot', (_event, sessionId: string) => readSessionWorkspaceRoot(sessionId));
  ipcMain.handle('workspaces:listTree', (_event, sessionId: string) => listWorkspaceTree(sessionId));
  ipcMain.handle('workspaces:previewFile', (_event, filePath: string) => previewWorkspaceFile(filePath));
}

function resolveTranscriptPath(sessionId: string): string {
  return join(app.getPath('userData'), 'sessions', `${sessionId}.jsonl`);
}

function resolveInsightsPath(sessionId: string): string {
  return join(app.getPath('userData'), 'session-insights', `${sessionId}.json`);
}

function resolveWorkspaceMetaPath(sessionId: string): string {
  return join(app.getPath('userData'), 'session-workspaces', `${sessionId}.json`);
}

function resolveDefaultWorkspaceBaseDir(): string {
  if (app.isPackaged) {
    return join(dirname(process.execPath), 'workspace');
  }
  return join(app.getAppPath(), 'workspace');
}

function isManagedPaperWorkspaceName(name: string): boolean {
  return /^paper_id_\d+$/i.test(name);
}

function formatPaperWorkspaceName(paperId: number): string {
  return `paper_id_${String(paperId).padStart(4, '0')}`;
}

async function allocateManagedWorkspaceRoot(baseDir: string): Promise<string> {
  await mkdir(baseDir, { recursive: true });
  const entries = await readdir(baseDir, { withFileTypes: true });
  let maxPaperId = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^paper_id_(\d+)$/i.exec(entry.name);
    if (!match) continue;
    const paperId = Number.parseInt(match[1], 10);
    if (Number.isFinite(paperId)) {
      maxPaperId = Math.max(maxPaperId, paperId);
    }
  }

  const nextPaperId = maxPaperId + 1;
  const workspaceRoot = join(baseDir, formatPaperWorkspaceName(nextPaperId));
  await mkdir(workspaceRoot, { recursive: true });
  return workspaceRoot;
}

async function deleteSession(sessionId: string): Promise<void> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error('sessions:delete needs a non-empty sessionId');
  }
  if (activeSessions.has(normalizedSessionId)) {
    throw new Error('cannot delete an active session');
  }

  const workspaceRoot = await readSessionWorkspaceRoot(normalizedSessionId);

  await deleteSessionLog(normalizedSessionId);
  await Promise.all([
    removePathIfExists(resolveTranscriptPath(normalizedSessionId)),
    removePathIfExists(resolveInsightsPath(normalizedSessionId)),
    removePathIfExists(resolveWorkspaceMetaPath(normalizedSessionId)),
  ]);

  if (workspaceRoot && isManagedPaperWorkspaceName(basename(workspaceRoot))) {
    await removePathIfExists(workspaceRoot);
  }
}

async function openChatSession(
  event: IpcMainInvokeEvent,
  firstMessage: string,
  runtimeMessage: string,
  showFirstMessage: boolean,
  requestedWorkspaceRoot?: string,
  resumeSessionId?: string,
): Promise<ChatStartOutcome> {
  const sessionId = randomUUID();
  const workspaceRoot = await ensureSessionWorkspaceRoot(sessionId, requestedWorkspaceRoot);
  const startedAt = Date.now();

  // 立刻写一条"运行中"占位 session log，这样侧边栏在会话还在跑的时候就能
  // 看到这个条目。provider / 统计字段留占位值，等 run-chat.ts 的 finally 块
  // 写入最终条目时会按 sessionId 被 readRecentSessions 去重覆盖掉。
  const startedLogEntry: SessionLogEntry = {
    sessionId,
    sdkSessionId: resumeSessionId,
    workspaceRoot,
    finishReason: undefined,
    startedAt,
    endedAt: startedAt,
    firstPrompt: firstMessage.slice(0, 120),
    providerSource: 'config',
    model: '(运行中)',
    userMessageCount: 1,
    agentTurnCount: 0,
    totalDurationMs: 0,
    totalCostUsd: 0,
    totalTokens: 0,
    ok: true,
  };
  try {
    await appendSessionLog(startedLogEntry);
  } catch (err) {
    console.warn('[chat] failed to persist started placeholder log:', err);
  }

  const abortController = new AbortController();
  const queue = new PromptQueue();

  const sender = event.sender;
  const channel = `chat:event:${sessionId}`;
  const stream: ChatEventStream = {
    sender,
    channel,
    attached: false,
    buffer: [],
  };
  chatEventStreams.set(sessionId, stream);
  const push = (ev: ChatEvent): void => {
    const currentStream = chatEventStreams.get(sessionId);
    if (!currentStream || currentStream.sender.isDestroyed()) return;
    if (currentStream.attached) {
      currentStream.sender.send(currentStream.channel, ev);
      return;
    }
    currentStream.buffer.push(ev);
  };

  const handle = await startChatSession({
    sessionId,
    firstMessage,
    runtimeMessage,
    queue,
    onEvent: push,
    signal: abortController.signal,
    showFirstMessage,
    resumeSessionId,
    workspaceRoot,
  });

  activeSessions.set(sessionId, { handle, queue, abortController, workspaceRoot });
  void handle.done.finally(() => {
    activeSessions.delete(sessionId);
    setTimeout(() => {
      const currentStream = chatEventStreams.get(sessionId);
      if (!currentStream || currentStream.attached) return;
      chatEventStreams.delete(sessionId);
    }, 60_000);
  });

  return { sessionId, workspaceRoot };
}

function validateChatMessageInput(payload: unknown, source: string): ChatMessageInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${source} needs a message payload`);
  }
  const candidate = payload as ChatMessageInput;
  if (typeof candidate.text !== 'string' || !candidate.text.trim()) {
    throw new Error(`${source} needs a non-empty text`);
  }
  if (candidate.attachments && !Array.isArray(candidate.attachments)) {
    throw new Error(`${source} attachments must be an array`);
  }
  return {
    text: candidate.text,
    displayText:
      typeof candidate.displayText === 'string' && candidate.displayText.trim()
        ? candidate.displayText.trim()
        : undefined,
    workspaceRoot:
      typeof candidate.workspaceRoot === 'string' && candidate.workspaceRoot.trim()
        ? candidate.workspaceRoot.trim()
        : undefined,
    attachments: (candidate.attachments ?? []).filter(
      (attachment): attachment is AttachedPath =>
        !!attachment &&
        typeof attachment.path === 'string' &&
        attachment.path.trim().length > 0 &&
        typeof attachment.kind === 'string',
    ),
  };
}

function withAttachedPaths(text: string, attachments?: AttachedPath[]): string {
  if (!attachments || attachments.length === 0) return text;
  const lines = attachments.map(
    (attachment) => `- ${attachmentLabel(attachment.kind)}: ${attachment.path}`,
  );
  return [
    '以下路径是当前任务明确提供给你的本地资源，请直接使用可用文件工具访问它们；不要要求用户重复提供路径。',
    ...lines,
    '',
    text,
  ].join('\n');
}

function withLocalContext(
  text: string,
  attachments?: AttachedPath[],
  workspaceRoot?: string,
): string {
  const lines: string[] = [];
  if (workspaceRoot) {
    lines.push(
      `当前会话的 workspace 根目录是：${workspaceRoot}`,
      '默认在这个目录内读写、搜索和组织研究文件；只有在任务明确需要时才跨出这个目录。',
    );
  }
  if (attachments && attachments.length > 0) {
    lines.push(
      '以下路径是当前任务明确提供给你的本地资源，请直接使用可用文件工具访问它们；不要要求用户重复提供路径。',
      ...attachments.map((attachment) => `- ${attachmentLabel(attachment.kind)}: ${attachment.path}`),
    );
  }
  if (lines.length === 0) return text;
  return [...lines, '', text].join('\n');
}

function attachmentLabel(kind: AttachmentKind): string {
  switch (kind) {
    case 'dataset_folder':
      return '数据集文件夹';
    case 'data_file':
      return '数据文件';
    case 'paper_file':
      return '参考论文';
    default:
      return '附加文件';
  }
}

async function pickPathsForAttachment(
  event: IpcMainInvokeEvent,
  kind: AttachmentKind,
): Promise<string[]> {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions =
    kind === 'dataset_folder'
      ? {
          title: '选择数据集文件夹',
          properties: ['openDirectory', 'multiSelections'],
        }
      : {
          title:
            kind === 'data_file'
              ? '选择数据文件'
              : kind === 'paper_file'
                ? '选择参考论文'
                : '选择文件',
          properties: ['openFile', 'multiSelections'],
          filters: fileFiltersForKind(kind),
        };

  const filePaths = owner
    ? dialog.showOpenDialogSync(owner, options)
    : dialog.showOpenDialogSync(options);
  return filePaths ?? [];
}

function fileFiltersForKind(kind: AttachmentKind) {
  switch (kind) {
    case 'data_file':
      return [
        {
          name: '数据文件',
          extensions: [
            'csv',
            'tsv',
            'xlsx',
            'xls',
            'dta',
            'sav',
            'parquet',
            'rds',
            'fst',
            'json',
            'jsonl',
            'txt',
            'zip',
            'gz',
          ],
        },
        { name: '所有文件', extensions: ['*'] },
      ];
    case 'paper_file':
      return [
        { name: '论文与引用文件', extensions: ['pdf', 'tex', 'bib', 'docx', 'md', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ];
    default:
      return [{ name: '所有文件', extensions: ['*'] }];
  }
}

async function ensureSessionWorkspaceRoot(
  sessionId: string,
  requestedRoot?: string,
): Promise<string> {
  const baseDir = requestedRoot?.trim() || resolveDefaultWorkspaceBaseDir();
  const workspaceRoot = await allocateManagedWorkspaceRoot(baseDir);
  await persistSessionWorkspaceRoot(sessionId, workspaceRoot);
  return workspaceRoot;
}

async function persistSessionWorkspaceRoot(sessionId: string, workspaceRoot: string): Promise<void> {
  if (!sessionId.trim() || !workspaceRoot.trim()) return;
  const filePath = resolveWorkspaceMetaPath(sessionId);
  await mkdir(join(app.getPath('userData'), 'session-workspaces'), { recursive: true });
  await writeFile(filePath, JSON.stringify({ workspaceRoot }, null, 2), 'utf8');
}

async function readSessionWorkspaceRoot(sessionId: string): Promise<string | null> {
  if (!sessionId.trim()) return null;
  try {
    const content = await readFile(resolveWorkspaceMetaPath(sessionId), 'utf8');
    const parsed = JSON.parse(content) as { workspaceRoot?: string };
    return typeof parsed.workspaceRoot === 'string' && parsed.workspaceRoot.trim()
      ? parsed.workspaceRoot
      : null;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return null;
    throw error;
  }
}

function pickWorkspaceDirectory(event: IpcMainInvokeEvent): string | null {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: '选择工作区目录',
    properties: ['openDirectory'],
  };
  const filePaths = owner
    ? dialog.showOpenDialogSync(owner, options)
    : dialog.showOpenDialogSync(options);
  return filePaths?.[0] ?? null;
}

async function listWorkspaceTree(sessionId: string): Promise<WorkspaceTreeNode[]> {
  const workspaceRoot = await readSessionWorkspaceRoot(sessionId);
  if (!workspaceRoot) return [];
  try {
    return await scanWorkspaceDirectory(workspaceRoot, workspaceRoot, 0, {
      count: 0,
      limit: 800,
    });
  } catch (error) {
    console.warn('failed to list workspace tree', { sessionId, workspaceRoot, error });
    return [];
  }
}

async function previewWorkspaceFile(filePath: string): Promise<WorkspaceFilePreview | null> {
  if (!filePath.trim()) return null;
  const mediaType = getPreviewMediaType(filePath);
  if (!mediaType) return null;
  try {
    const info = await stat(filePath);
    if (info.size > 512 * 1024) {
      return {
        filePath,
        name: basename(filePath),
        content: '文件过大，暂不在侧栏内预览，请直接打开原文件查看。',
        mediaType,
      };
    }
    return {
      filePath,
      name: basename(filePath),
      content: await readFile(filePath, 'utf8'),
      mediaType,
    };
  } catch (error) {
    console.warn('failed to preview workspace file', { filePath, error });
    return null;
  }
}

async function scanWorkspaceDirectory(
  rootPath: string,
  currentPath: string,
  depth: number,
  budget: { count: number; limit: number },
): Promise<WorkspaceTreeNode[]> {
  if (depth > 6 || budget.count >= budget.limit) return [];
  const entries = await readdir(currentPath, { withFileTypes: true });
  const nodes: WorkspaceTreeNode[] = [];

  for (const entry of entries) {
    if (budget.count >= budget.limit) break;
    if (shouldIgnoreWorkspaceEntry(entry.name)) continue;
    const fullPath = join(currentPath, entry.name);
    const relativePath = toWorkspaceRelativePath(rootPath, fullPath);
    budget.count += 1;

    if (entry.isDirectory()) {
      const children = await scanWorkspaceDirectory(rootPath, fullPath, depth + 1, budget);
      nodes.push({
        name: entry.name,
        path: relativePath,
        kind: 'directory',
        filePath: fullPath,
        children,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: relativePath,
        kind: 'file',
        filePath: fullPath,
      });
    }
  }

  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function shouldIgnoreWorkspaceEntry(name: string): boolean {
  return [
    '.git',
    '.idea',
    '.vscode',
    'node_modules',
    'dist',
    'out',
    '__pycache__',
    '.DS_Store',
  ].includes(name);
}

function toWorkspaceRelativePath(rootPath: string, targetPath: string): string {
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedTarget = targetPath.replace(/\\/g, '/');
  return normalizedTarget.startsWith(`${normalizedRoot}/`)
    ? normalizedTarget.slice(normalizedRoot.length + 1)
    : basename(targetPath);
}

function getPreviewMediaType(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.md') return 'text/markdown';
  if (
    [
      '.txt',
      '.csv',
      '.tsv',
      '.json',
      '.jsonl',
      '.r',
      '.rmd',
      '.tex',
      '.bib',
      '.log',
      '.yaml',
      '.yml',
      '.xml',
      '.html',
      '.css',
      '.js',
      '.ts',
      '.py',
      '.sql',
    ].includes(extension)
  ) {
    return 'text/plain';
  }
  return null;
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

async function readSessionInsights(sessionId: string): Promise<RunInsightsPersisted | null> {
  if (!sessionId.trim()) return null;
  const filePath = resolveInsightsPath(sessionId);
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as RunInsightsPersisted;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function persistSessionInsights(
  sessionId: string,
  insights: RunInsightsPersisted,
): Promise<void> {
  if (!sessionId.trim()) return;
  const filePath = resolveInsightsPath(sessionId);
  await mkdir(join(app.getPath('userData'), 'session-insights'), { recursive: true });
  await writeFile(filePath, JSON.stringify(insights, null, 2), 'utf8');
}

async function removePathIfExists(targetPath: string): Promise<void> {
  try {
    await rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('failed to remove path', { targetPath, error });
  }
}

async function openArtifactPath(filePath: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, error: 'invalid file path' };
  }
  const error = await shell.openPath(filePath);
  return error ? { ok: false, error } : { ok: true };
}

function validateResumePayload(payload: unknown): asserts payload is ChatResumeInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('chat:resume expects an object payload');
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.guidance !== 'string' || !record.guidance.trim()) {
    throw new Error('chat:resume requires a non-empty guidance string');
  }
  if (
    'displayGuidance' in record &&
    record.displayGuidance !== undefined &&
    typeof record.displayGuidance !== 'string'
  ) {
    throw new Error('chat:resume displayGuidance must be a string when provided');
  }
  if (typeof record.sdkSessionId !== 'string' || !record.sdkSessionId.trim()) {
    throw new Error('chat:resume requires a non-empty sdkSessionId');
  }
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
        error: 'Rscript --version 超时（3s）',
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
  coaseAppUpdater.init();
  // 上次运行中的会话如果因为崩溃/强退没写完 finish 记录，会永久显示为"运行中"。
  // 启动时补一条 error seal，把它们规整成"上次未正常结束"。
  void sealOrphanedSessions()
    .then((sealed) => {
      if (sealed.length > 0) {
        console.info(`[session-log] sealed ${sealed.length} orphaned session(s)`);
      }
    })
    .catch((err) => {
      console.warn('[session-log] sealOrphanedSessions failed:', err);
    });
  registerIpc();
  createMainWindow();
  coaseAppUpdater.maybeCheckOnStartup();

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
