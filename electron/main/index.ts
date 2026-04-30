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
import { startAnthropicProxy, stopAnthropicProxy } from '../../agent/proxy/anthropic-proxy';
import { PromptQueue } from '../../agent/chat/prompt-queue';
import {
  getPixiVersion,
  pixiBinaryPath,
  researchEnvRoot,
  runtimeInstallManager,
} from '../../agent/runtime';
import {
  appendSessionLog,
  compactSessionLogIfNeeded,
  deleteSessionLog,
  loadSessionEntry,
  readRecentSessions,
  sealOrphanedSessions,
} from '../../agent/logging/session-log';
import type { SessionLogEntry } from '../../shared/runs';
import { startChatSession, type ChatSessionHandle } from '../../agent/orchestrator/run-chat';
import {
  deleteProvider,
  getCriticPanelIds,
  listProviders,
  setActiveProvider,
  setCriticPanelIds,
  upsertProvider,
} from '../../agent/providers/config-store';
import { loadAppPrefs, resolveAppLanguage, saveAppPrefs } from '../../agent/app/prefs-store';
import { loadResearchPrefs, saveResearchPrefs } from '../../agent/research/prefs-store';
import { invokeCriticPanel } from '../../agent/providers/invoke';
import { PROVIDER_PRESETS } from '../../agent/providers/presets';
import { testProviderConnection } from '../../agent/providers/test-connection';
import { deleteUserSkill, importSkill, openUserSkillsDir } from '../../agent/skills/skill-manager';
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
import type { AppPrefs } from '../../shared/app-prefs';
import type { ProviderRecord } from '../../shared/providers';
import type { ResearchPrefs } from '../../shared/research-prefs';

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
        payload.coaseSessionId?.trim() || undefined,
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

  ipcMain.handle('providers:getCriticPanel', () => getCriticPanelIds());

  ipcMain.handle('providers:setCriticPanel', async (_event, ids: string[] | null) => {
    if (ids !== null && !Array.isArray(ids)) {
      throw new Error('providers:setCriticPanel expects an array or null');
    }
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id !== 'string' || !id) {
          throw new Error('providers:setCriticPanel array must contain non-empty strings');
        }
      }
    }
    await setCriticPanelIds(ids);
  });

  ipcMain.handle(
    'providers:invokeCriticPanel',
    async (
      _event,
      payload: {
        system?: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        maxTokens?: number;
        timeoutMs?: number;
      },
    ) => {
      if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
        throw new Error('providers:invokeCriticPanel needs messages[]');
      }
      return invokeCriticPanel({
        system: payload.system,
        messages: payload.messages,
        maxTokens: payload.maxTokens,
        timeoutMs: payload.timeoutMs,
      });
    },
  );

  ipcMain.handle('researchPrefs:get', () => loadResearchPrefs());

  ipcMain.handle('researchPrefs:set', async (_event, prefs: ResearchPrefs) => {
    if (!prefs || typeof prefs !== 'object') {
      throw new Error('researchPrefs:set expects an object payload');
    }
    return saveResearchPrefs(prefs);
  });

  ipcMain.handle('appPrefs:get', () => loadAppPrefs());

  ipcMain.handle('appPrefs:set', async (_event, prefs: AppPrefs) => {
    if (!prefs || typeof prefs !== 'object') {
      throw new Error('appPrefs:set expects an object payload');
    }
    return saveAppPrefs(prefs);
  });

  ipcMain.handle('appPrefs:resolvedLanguage', async () => resolveAppLanguage(await loadAppPrefs()));

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
  ipcMain.handle('skills:import', (event: IpcMainInvokeEvent) =>
    importSkill(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle('skills:delete', (_event: IpcMainInvokeEvent, name: string) =>
    deleteUserSkill(name),
  );
  ipcMain.handle('skills:openUserDir', () => openUserSkillsDir());
  ipcMain.handle('rEnv:check', async (): Promise<REnvStatus> => checkREnv());
  ipcMain.handle('runtime:getSnapshot', () => runtimeInstallManager.snapshot());
  ipcMain.handle('runtime:install', () => runtimeInstallManager.install());
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

  // 如果这条会话还在跑，先停它：发 cancel + abort，并等 orchestrator 真正走完
  // mainLoop 才去删文件。否则 run-chat 的 finalize 会在删完日志后又追加一条新
  // 日志（把被删的条目复活），更糟的是 workspace 里还没退的子进程会抱着文件
  // 句柄，导致 Windows 下 rm -rf 报 EBUSY/EPERM。超时兜底（5s）保证最坏情况
  // 下也不至于把 UI 卡住——超时就放弃删 workspace 目录，其它元数据照常清理。
  const active = activeSessions.get(normalizedSessionId);
  if (active) {
    try {
      active.handle.cancel('user_cancel');
    } catch (err) {
      console.warn('[sessions:delete] cancel failed', err);
    }
    try {
      active.abortController.abort();
    } catch {
      // ignore
    }
    await waitWithTimeout(active.handle.done, 5_000);
    // 正常情况下 handle.done.finally 已经把它清走了；兜底再 delete 一次。
    activeSessions.delete(normalizedSessionId);
  }

  const workspaceRoot = await readSessionWorkspaceRoot(normalizedSessionId);

  await deleteSessionLog(normalizedSessionId);
  await Promise.all([
    removePathIfExists(resolveTranscriptPath(normalizedSessionId)),
    removePathIfExists(resolveInsightsPath(normalizedSessionId)),
    removePathIfExists(resolveWorkspaceMetaPath(normalizedSessionId)),
  ]);

  if (workspaceRoot && isManagedPaperWorkspaceName(basename(workspaceRoot))) {
    try {
      await removePathIfExists(workspaceRoot);
    } catch (err) {
      // workspace 里的子进程还没来得及释放句柄——日志已清掉，workspace 留着
      // 不影响正确性（下次启动会被当作孤儿目录），只记一条 warning。
      console.warn('[sessions:delete] remove workspace failed', workspaceRoot, err);
    }
  }
}

async function waitWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function openChatSession(
  event: IpcMainInvokeEvent,
  firstMessage: string,
  runtimeMessage: string,
  showFirstMessage: boolean,
  requestedWorkspaceRoot?: string,
  resumeSessionId?: string,
  /**
   * 仅 resume 续跑时传：复用该 Coase 会话 id、复用其原 workspace、把它之前的累计
   * 花销当作起点，这样侧边栏里这条会话从头到尾只显示为一行，不会每次续跑都产出
   * 一个新行。传空字符串或 undefined 则退化为新起一条 Coase 会话。
   */
  reuseCoaseSessionId?: string,
): Promise<ChatStartOutcome> {
  // 1. 计算 sessionId + workspaceRoot。resume 时尽量复用原有的两者；任何一个
  //    没拿到都回退到"新起一条"——不直接抛错，避免用户误点续跑就永远卡住。
  let sessionId: string;
  let workspaceRoot: string;
  let priorEntry: SessionLogEntry | null = null;

  if (reuseCoaseSessionId) {
    priorEntry = await safeLoadSessionEntry(reuseCoaseSessionId);
  }

  if (reuseCoaseSessionId && priorEntry) {
    sessionId = reuseCoaseSessionId;
    const reusableWorkspace = await resolveReusableWorkspaceRoot(
      reuseCoaseSessionId,
      priorEntry,
      requestedWorkspaceRoot,
    );
    workspaceRoot =
      reusableWorkspace ?? (await ensureSessionWorkspaceRoot(sessionId, requestedWorkspaceRoot));
  } else {
    sessionId = randomUUID();
    workspaceRoot = await ensureSessionWorkspaceRoot(sessionId, requestedWorkspaceRoot);
  }

  const now = Date.now();
  const effectiveStartedAt = priorEntry?.startedAt ?? now;
  const persistedFirstPrompt = priorEntry?.firstPrompt ?? firstMessage.slice(0, 120);

  // 2. 写"运行中"占位 session log。合并 priorEntry 保证续跑期间侧边栏显示的
  //    累计总耗不会被占位抹成 0。
  const startedLogEntry: SessionLogEntry = {
    sessionId,
    sdkSessionId: resumeSessionId ?? priorEntry?.sdkSessionId,
    workspaceRoot,
    finishReason: undefined,
    startedAt: effectiveStartedAt,
    endedAt: now,
    firstPrompt: persistedFirstPrompt,
    providerSource: priorEntry?.providerSource ?? 'config',
    providerId: priorEntry?.providerId,
    providerLabel: priorEntry?.providerLabel,
    model: priorEntry?.model ?? '(运行中)',
    baseURL: priorEntry?.baseURL,
    userMessageCount: (priorEntry?.userMessageCount ?? 0) + 1,
    agentTurnCount: priorEntry?.agentTurnCount ?? 0,
    totalDurationMs: priorEntry?.totalDurationMs ?? 0,
    totalCostUsd: priorEntry?.totalCostUsd ?? 0,
    totalTokens: priorEntry?.totalTokens ?? 0,
    totalInputTokens: priorEntry?.totalInputTokens ?? 0,
    totalOutputTokens: priorEntry?.totalOutputTokens ?? 0,
    totalCacheTokens: priorEntry?.totalCacheTokens ?? 0,
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
    // 把 priorEntry 的累计字段当作 run-chat stats 的起点，确保结束时写回的
    // 终态日志里的 totalCostUsd / totalTokens / turns 都是"自首次启动以来"的累计。
    priorStats: priorEntry
      ? {
          userMessageCount: priorEntry.userMessageCount,
          agentTurnCount: priorEntry.agentTurnCount,
          totalDurationMs: priorEntry.totalDurationMs,
          totalCostUsd: priorEntry.totalCostUsd,
          totalTokens: priorEntry.totalTokens ?? 0,
          totalInputTokens: priorEntry.totalInputTokens ?? 0,
          totalOutputTokens: priorEntry.totalOutputTokens ?? 0,
          totalCacheTokens: priorEntry.totalCacheTokens ?? 0,
        }
      : undefined,
    originalStartedAt: priorEntry?.startedAt,
    persistedFirstPrompt: priorEntry?.firstPrompt,
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

async function safeLoadSessionEntry(sessionId: string): Promise<SessionLogEntry | null> {
  try {
    return await loadSessionEntry(sessionId);
  } catch (err) {
    console.warn('[chat] loadSessionEntry failed:', err);
    return null;
  }
}

/**
 * 决定续跑时应该用哪个 workspace 目录：
 * - 用户在续跑 dialog 里明确选了新的 requested root，尊重用户；
 * - 否则优先用 priorEntry 记录的 workspaceRoot（仍然存在时直接复用，不再分配新的 paper_id_*）；
 * - 再退回 {userData}/session-workspaces/{sessionId}.json 里的记录；
 * - 都拿不到就返回 null，由调用方 allocate 新的。
 */
async function resolveReusableWorkspaceRoot(
  sessionId: string,
  priorEntry: SessionLogEntry,
  requestedRoot: string | undefined,
): Promise<string | null> {
  if (requestedRoot && requestedRoot.trim()) return null;
  const candidates: string[] = [];
  if (priorEntry.workspaceRoot) candidates.push(priorEntry.workspaceRoot);
  const metaRoot = await readSessionWorkspaceRoot(sessionId);
  if (metaRoot && !candidates.includes(metaRoot)) candidates.push(metaRoot);

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        await persistSessionWorkspaceRoot(sessionId, candidate);
        return candidate;
      }
    } catch {
      // candidate gone, keep trying
    }
  }
  return null;
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
  const fromMeta = await readWorkspaceRootFromMeta(sessionId);
  if (fromMeta) return fromMeta;

  // meta 缺失（老会话没落盘、或文件被清过）时回退到 session-log 里的
  // workspaceRoot；目录确实存在就顺手把 meta 补回来，下次命中快路径。
  try {
    const entry = await loadSessionEntry(sessionId);
    const logged = entry?.workspaceRoot?.trim();
    if (!logged) return null;
    const exists = await stat(logged)
      .then((info) => info.isDirectory())
      .catch(() => false);
    if (!exists) return null;
    await persistSessionWorkspaceRoot(sessionId, logged);
    return logged;
  } catch {
    return null;
  }
}

async function readWorkspaceRootFromMeta(sessionId: string): Promise<string | null> {
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
  if (r.autoCompactWindow !== undefined && r.autoCompactWindow !== null) {
    if (typeof r.autoCompactWindow !== 'number' || !Number.isFinite(r.autoCompactWindow)) {
      throw new Error('provider.autoCompactWindow must be a finite number when provided');
    }
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
  // 启动时把 append-only 日志压实一次。研究工作流常年跑同一批会话，不做压实
  // 会让每次 readRecentSessions 都要 parse 越来越多的 placeholder / 终态行。
  void compactSessionLogIfNeeded()
    .then((result) => {
      if (result.rewrote) {
        console.info(`[session-log] compacted to ${result.entries} entries`);
      }
    })
    .catch((err) => {
      console.warn('[session-log] compactSessionLogIfNeeded failed:', err);
    });
  registerIpc();
  // P1 smoke test: 启动时打一下 pixi 版本，确认 fetch-pixi.mjs 产物和路径解析都对。
  // 生产环境也会跑，但只是一行 console.info，没有任何副作用。失败不阻断启动——
  // P2 加安装向导之前这属于预期状态。
  void getPixiVersion()
    .then((version) => {
      console.info(`[runtime] ${version} @ ${pixiBinaryPath()}`);
    })
    .catch((err) => {
      console.warn(`[runtime] pixi 自检失败（P2 安装向导会处理）: ${err?.message ?? err}`);
    });
  // P4: 研究环境（R + Python）有没有解出来。只做 fs 检查，不跑 Rscript/python，
  // 省启动时的 2s 冷启延迟。解出来后 agent 的 childEnv 会自动注入 PATH。
  const runtimeSnap = runtimeInstallManager.probeOnBoot();
  if (runtimeSnap.state === 'ready') {
    console.info(`[runtime] research env detected @ ${researchEnvRoot()}`);
  } else if (runtimeSnap.state === 'not_installed') {
    console.warn(
      `[runtime] research env not installed @ ${researchEnvRoot()} —— 首启向导会引导安装`,
    );
  } else if (runtimeSnap.state === 'error') {
    console.error(`[runtime] probe error: ${runtimeSnap.message}`);
  }
  // 状态变更广播给所有渲染窗口。订阅只挂一次；每次 state/logs 更新都推一份 snapshot。
  runtimeInstallManager.onChange((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('runtime:event', snapshot);
      }
    }
  });
  // 启动本地 anthropic 反向代理（loopback only）。Provider 标了"禁用思考模式"
  // 时 sdk/client.ts 会把 ANTHROPIC_BASE_URL 重定向到这里，由代理在 /v1/messages
  // body 注入 thinking={type:'disabled'} 再转发到真实上游——绕开 SDK cli.js
  // 对 thinking={type:'disabled'} 的拦截行为。
  void startAnthropicProxy().catch((err) => {
    console.warn('[anthropic-proxy] failed to start; disableThinking 将不可用:', err);
  });
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
  // 异步关代理但不阻塞 quit；fire-and-forget。
  void stopAnthropicProxy().catch(() => {
    /* noop */
  });
});
