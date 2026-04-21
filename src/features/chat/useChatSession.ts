// 会话 Hook：只负责把 SessionsStore 的前台 runtime 快照转换成 React 组件需要
// 的 ChatSessionValue。多会话状态（含后台运行）由 SessionsStore 持有。
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { AttachedPath, AttachmentKind } from '../../../shared/ipc';
import type { SessionLogEntry } from '../../../shared/runs';
import type { TranscriptEntry } from './TranscriptMessage';
import { deriveRunInsights, type ArtifactRecord, type MilestoneRecord } from './run-insights';
import {
  injectSlashCommandContext,
  type SelectedSlashCommand,
} from './slash-commands';
import {
  sessionsStore,
  withAttachmentSummary,
  type ChatState,
  type ComposerAttachment,
  type ContextUsage,
  type LiveTurnUsage,
  type RunStatus,
  type SessionRuntime,
} from './sessions-store';

type InferredStage = 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer' | 'idle';

export type { ComposerAttachment };

export interface GuidanceRecord {
  id: string;
  ts: number;
  text: string;
}

export interface ChatSessionValue {
  runId: string | null;
  runStatus: RunStatus;
  sessionId: string | null;
  workspaceRoot: string | null;
  workspaceMode: 'auto' | 'custom';
  chatState: ChatState;
  transcript: TranscriptEntry[];
  input: string;
  latestProvider: { label: string; model: string; baseURL?: string } | null;
  latestTurnMetrics: {
    ok: boolean;
    turns?: number;
    durationMs?: number;
    costUsd?: number;
  } | null;
  totalTokens: number;
  contextUsage: ContextUsage | null;
  liveTurnUsage: LiveTurnUsage | null;
  inferredStage: InferredStage;
  currentMilestone: string;
  artifactCount: number;
  milestones: MilestoneRecord[];
  artifacts: ArtifactRecord[];
  attachments: ComposerAttachment[];
  selectedCommands: SelectedSlashCommand[];
  guidanceHistory: GuidanceRecord[];
  summaryRefreshKey: number;
  setInput: (value: string) => void;
  addAttachments: (kind: AttachmentKind, paths: string[]) => void;
  removeAttachment: (id: string) => void;
  addSelectedCommand: (command: SelectedSlashCommand) => void;
  removeSelectedCommand: (id: string) => void;
  clearSelectedCommands: () => void;
  chooseWorkspaceRoot: () => Promise<void>;
  resetWorkspaceRoot: () => void;
  onSubmit: () => void;
  onCancel: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onNewSession: () => Promise<void>;
  openHistoricalSession: (session: SessionLogEntry) => Promise<void>;
  resumeHistoricalSession: (session: SessionLogEntry) => Promise<void>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}

// ---------------------------------------------------------------------------
// 快照：store snapshot 粒度粗，只携带"世代号"；这里每次 re-render 时从 store
// 重新取前台 runtime 的最新引用，派生真正暴露给组件的字段。useSyncExternalStore
// 的 snapshot equality 依赖 generation 号，所以只要 store bump 过就会 re-render。
// ---------------------------------------------------------------------------

export function useChatSession(): ChatSessionValue {
  // 订阅 store，任何状态变化都会触发 re-render
  useSyncExternalStore(sessionsStore.subscribe, sessionsStore.getSnapshot, sessionsStore.getSnapshot);

  const runtime = sessionsStore.getForegroundRuntime();
  const summaryRefreshKey = sessionsStore.getSnapshot().summaryRefreshKey;

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transcript = runtime?.transcript ?? EMPTY_TRANSCRIPT;

  // 滚动：transcript 变化时滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const insights = useMemo(() => deriveRunInsights(transcript), [transcript]);
  const inferredStage = useMemo(() => inferStage(transcript), [transcript]);
  const totalTokens = useMemo(
    () =>
      transcript.reduce(
        (sum, entry) => sum + (entry.kind === 'turn_result' ? entry.totalTokens ?? 0 : 0),
        0,
      ),
    [transcript],
  );
  const latestProvider = useMemo(() => findLatestProviderBadge(transcript), [transcript]);
  const latestTurnMetrics = useMemo(() => findLatestTurnMetrics(transcript), [transcript]);
  const guidanceHistory = useMemo(() => collectGuidanceHistory(transcript), [transcript]);

  const placeholder = buildPlaceholder(runtime?.chatState ?? 'idle', runtime?.runStatus ?? 'idle', runtime?.runId ?? null);

  // ---------- 操作：委托给 store ----------

  const setInput = useCallback((value: string) => {
    sessionsStore.setInput(value);
  }, []);

  const addAttachments = useCallback((kind: AttachmentKind, paths: string[]) => {
    sessionsStore.addAttachments(kind, paths);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    sessionsStore.removeAttachment(id);
  }, []);

  const addSelectedCommand = useCallback((command: SelectedSlashCommand) => {
    sessionsStore.addSelectedCommand(command);
  }, []);

  const removeSelectedCommand = useCallback((id: string) => {
    sessionsStore.removeSelectedCommand(id);
  }, []);

  const clearSelectedCommands = useCallback(() => {
    sessionsStore.clearSelectedCommands();
  }, []);

  const chooseWorkspaceRoot = useCallback(async () => {
    await sessionsStore.chooseWorkspaceRoot();
  }, []);

  const resetWorkspaceRoot = useCallback(() => {
    sessionsStore.resetWorkspaceRoot();
  }, []);

  const onSubmit = useCallback(() => {
    const rt = sessionsStore.getForegroundRuntime();
    const input = rt?.input ?? '';
    const attachments = rt?.attachments ?? [];
    const selectedCommands = rt?.selectedCommands ?? [];
    const text = input.trim();
    if ((!text && selectedCommands.length === 0) || rt?.chatState === 'running') return;

    // 先把输入清空（UI 立即响应），再派发。store 里各 action 会把 attachments
    // 一并清掉——这里只清 input / selectedCommands 以免数据送出去前被消除。
    sessionsStore.setInput('');
    sessionsStore.clearSelectedCommands();

    const visibleText = withAttachmentSummary(text, attachments);
    const commandAwareText = injectSlashCommandContext(visibleText, selectedCommands);

    // 场景 1：foreground 还没有 runtime（冷启动）或 runtime 没拿到真 sessionId（draft）
    if (!rt || !rt.sessionId) {
      void sessionsStore.startFromDraft(visibleText, commandAwareText);
      return;
    }

    // 场景 2：已 finished 的会话（awaiting/completed/failed/cancelled），按 Enter 续跑
    if (
      rt.runStatus !== 'running' &&
      rt.runStatus !== 'idle' &&
      rt.transcript.length > 0 &&
      rt.runId &&
      rt.sdkSessionId
    ) {
      void sessionsStore.resumeFromForeground(visibleText, commandAwareText);
      return;
    }

    // 场景 3：waiting —— 上一回合结束，继续 followup（同一 chat:send 通道）
    if (rt.chatState === 'waiting') {
      void sessionsStore.sendFollowup(visibleText, commandAwareText);
      return;
    }

    // 场景 4（兜底，不太会走到）：idle + 有 sessionId（历史浏览态） —— 视为重开一次
    // 对话，走 resume。没有 sdkSessionId 时降级为新 fresh 会话。
    if (rt.sdkSessionId) {
      void sessionsStore.resumeFromForeground(visibleText, commandAwareText);
    } else {
      void (async () => {
        await sessionsStore.createDraft();
        await sessionsStore.startFromDraft(visibleText, commandAwareText);
      })();
    }
  }, []);

  const onCancel = useCallback(async () => {
    await sessionsStore.cancelForeground();
  }, []);

  const onInterrupt = useCallback(async () => {
    await sessionsStore.interruptForeground();
  }, []);

  const onNewSession = useCallback(async () => {
    // 串行语义：切走运行中的会话 = 自动挂起它（interrupt 到 awaiting_user_guidance）。
    // 用户稍后从侧边栏切回并按 Enter 可继续。
    const current = sessionsStore.getForegroundRuntime();
    if (current && current.key.startsWith('draft:')) {
      // 当前就是 draft —— 直接原地清空，不制造悬空 draft。
      sessionsStore.patchForeground({
        input: '',
        attachments: [],
        selectedCommands: [],
        transcript: [],
      });
    } else {
      await sessionsStore.createDraft();
    }
    textareaRef.current?.focus();
  }, []);

  const openHistoricalSession = useCallback(async (session: SessionLogEntry) => {
    await sessionsStore.openHistoricalView(session);
  }, []);

  const resumeHistoricalSession = useCallback(async (session: SessionLogEntry) => {
    await sessionsStore.openHistoricalForResume(session);
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  return {
    runId: runtime?.runId ?? null,
    runStatus: runtime?.runStatus ?? 'idle',
    sessionId: runtime?.sessionId ?? null,
    workspaceRoot: runtime?.workspaceRoot ?? null,
    workspaceMode: runtime?.workspaceMode ?? 'auto',
    chatState: runtime?.chatState ?? 'idle',
    transcript,
    input: runtime?.input ?? '',
    latestProvider,
    latestTurnMetrics,
    totalTokens,
    contextUsage: runtime?.contextUsage ?? null,
    liveTurnUsage: runtime?.liveTurnUsage ?? null,
    inferredStage,
    currentMilestone: insights.currentMilestone,
    artifactCount: insights.artifacts.length,
    milestones: insights.milestones,
    artifacts: insights.artifacts,
    attachments: runtime?.attachments ?? EMPTY_ATTACHMENTS,
    selectedCommands: runtime?.selectedCommands ?? EMPTY_SELECTED_COMMANDS,
    guidanceHistory,
    summaryRefreshKey,
    setInput,
    addAttachments,
    removeAttachment,
    addSelectedCommand,
    removeSelectedCommand,
    clearSelectedCommands,
    chooseWorkspaceRoot,
    resetWorkspaceRoot,
    onSubmit,
    onCancel,
    onInterrupt,
    onNewSession,
    openHistoricalSession,
    resumeHistoricalSession,
    onKeyDown,
    scrollRef,
    textareaRef,
    placeholder,
  };
}

// ---------------------------------------------------------------------------
// 派生：从 transcript 导出 UI 需要的辅助视图
// ---------------------------------------------------------------------------

const EMPTY_TRANSCRIPT: TranscriptEntry[] = [];
const EMPTY_ATTACHMENTS: ComposerAttachment[] = [];
const EMPTY_SELECTED_COMMANDS: SelectedSlashCommand[] = [];

function findLatestProviderBadge(transcript: TranscriptEntry[]):
  | { label: string; model: string; baseURL?: string }
  | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'provider') {
      const label =
        entry.providerLabel ?? (entry.text.match(/^使用\s+(.+?)\s+·/) ?? [])[1] ?? '未命名';
      return {
        label,
        model: entry.model,
        baseURL: entry.baseURL,
      };
    }
  }
  return null;
}

function findLatestTurnMetrics(transcript: TranscriptEntry[]):
  | { ok: boolean; turns?: number; durationMs?: number; costUsd?: number }
  | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'turn_result') {
      return {
        ok: entry.ok,
        turns: entry.turns,
        durationMs: entry.durationMs,
        costUsd: entry.costUsd,
      };
    }
  }
  return null;
}

function collectGuidanceHistory(transcript: TranscriptEntry[]): GuidanceRecord[] {
  return transcript
    .filter((entry): entry is Extract<TranscriptEntry, { kind: 'guidance' }> => entry.kind === 'guidance')
    .map((entry, index) => ({
      id: `${entry.ts}-${index}`,
      ts: entry.ts,
      text: entry.text,
    }));
}

function inferStage(transcript: TranscriptEntry[]): InferredStage {
  const rules: { stage: InferredStage; keywords: string[] }[] = [
    { stage: 'reviewer', keywords: ['reviewer', '审校'] },
    { stage: 'writer', keywords: ['writer', '写作'] },
    { stage: 'analyst', keywords: ['analyst', '分析'] },
    { stage: 'datafetcher', keywords: ['datafetcher', '取数'] },
    { stage: 'planner', keywords: ['planner', '规划'] },
  ];

  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    const haystack =
      entry.kind === 'tool_use'
        ? entry.name.toLowerCase()
        : entry.kind === 'assistant' || entry.kind === 'guidance'
          ? entry.text.toLowerCase()
          : '';
    if (!haystack) continue;
    for (const rule of rules) {
      if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
        return rule.stage;
      }
    }
  }
  return 'idle';
}

function buildPlaceholder(chatState: ChatState, runStatus: RunStatus, runId: string | null): string {
  if (runStatus === 'awaiting_user_guidance') return '输入你的纠偏建议，Enter 继续当前研究';
  if (runStatus === 'completed' && runId) {
    return '可继续补充修改意见，Enter 让 Coase 在当前结果上继续迭代';
  }
  if (chatState === 'idle') return '输入研究主题 / 问题开始新研究，Enter 发送，Shift+Enter 换行';
  if (chatState === 'waiting') return '当前回合已结束，可继续补充约束或问题';
  return 'agent 正在自动推进研究，可通过右侧暂停按钮打断';
}

// 兼容老导入：部分上游组件可能通过 useChatSession 重新 re-export 读这些类型。
// 保持导出，避免因为 module-level rename 引发连锁编译错误。
export type { SessionRuntime };
export { withAttachmentSummary };

// 保留 shared/ipc 的 AttachedPath 类型别名，避免老消费者路径破损。
export type { AttachedPath };
