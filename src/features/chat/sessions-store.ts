// 多会话 runtime store：前端侧与 main 进程的 `activeSessions` 一对一对应。
//
// 设计动机：原来前端只有一份 transcript/chatState/unsubscribe，切会话时会 cancel
// 掉正在跑的会话。新架构让 N 条会话在前端同时"活着"——每条独立订阅事件流、独立
// 累积 transcript、独立节流持久化。切视图只是换 foregroundKey 指针，不动任何
// 正在跑的会话。
//
// Key 模式：
//   - `draft:<uuid>`：新会话撰写态，还没调 chat:start，没有真 sessionId。
//   - `<realSessionId>`：已经拿到了 main 返回的 Coase 会话 id。
// 发首条消息时 startSession 会把 draft runtime 重命名成真 sessionId 的 runtime。
//
// 订阅策略：会话一旦进入 running，就挂住 chat.onEvent(sessionId, ...) 订阅。
// 会话 finished 后订阅会在 60s 内被保留一段（main 的 event stream buffer 会在
// detach 后留 60s 再清），以便用户意外切走又切回来时仍然不丢尾部事件。实际上
// 这里我们直接保留到 runtime 被 dispose 为止。
import type {
  ChatEvent,
  ChatResumeInput,
  RunInsightsPersisted,
  TranscriptEntryPersisted,
  Unsubscribe,
} from '../../../shared/ipc';
import type { SessionLogEntry } from '../../../shared/runs';
import type { TranscriptEntry } from './TranscriptMessage';
import { deriveRunInsights } from './run-insights';
import {
  injectSlashCommandContext,
  type SelectedSlashCommand,
} from './slash-commands';

export type ChatState = 'idle' | 'running' | 'waiting';
export type RunStatus =
  | 'idle'
  | 'running'
  | 'awaiting_user_guidance'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AttachmentKind = 'dataset_folder' | 'data_file' | 'paper_file' | 'other_file';

export interface ComposerAttachment {
  id: string;
  kind: AttachmentKind;
  path: string;
  name: string;
}

export interface ContextUsage {
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens: number;
  percentage: number;
  model?: string;
  categories: Array<{
    name: string;
    tokens: number;
    color: string;
    isDeferred?: boolean;
  }>;
}

/** Store 内部每条会话的 runtime 视图。 */
export interface SessionRuntime {
  /** Map key；draft 期形如 `draft:<uuid>`，发了首消息后变成真 sessionId。 */
  key: string;
  /** Main 返回的真 Coase sessionId；draft 期为 null。 */
  sessionId: string | null;
  /** SDK 侧的 session id，来自 sdk_session_bound 事件。 */
  sdkSessionId: string | null;
  /** 续跑场景下原始 Coase 会话 id。 */
  historicalCoaseSessionId: string | null;
  runId: string | null;
  transcript: TranscriptEntry[];
  chatState: ChatState;
  runStatus: RunStatus;
  contextUsage: ContextUsage | null;
  workspaceRoot: string | null;
  workspaceMode: 'auto' | 'custom';
  input: string;
  attachments: ComposerAttachment[];
  selectedCommands: SelectedSlashCommand[];
  /** 事件订阅句柄；只要挂着就说明在持续接收 main 的事件。 */
  unsubscribe: Unsubscribe | null;
  /** 节流持久化用。 */
  persistTimer: ReturnType<typeof setTimeout> | null;
  /** 用户能看到的标题兜底（draft 时没有；后续自动标题生成会覆盖）。 */
  firstPrompt: string | null;
  createdAt: number;
}

function createEmptyRuntime(key: string): SessionRuntime {
  return {
    key,
    sessionId: null,
    sdkSessionId: null,
    historicalCoaseSessionId: null,
    runId: null,
    transcript: [],
    chatState: 'idle',
    runStatus: 'idle',
    contextUsage: null,
    workspaceRoot: null,
    workspaceMode: 'auto',
    input: '',
    attachments: [],
    selectedCommands: [],
    unsubscribe: null,
    persistTimer: null,
    firstPrompt: null,
    createdAt: Date.now(),
  };
}

function newDraftKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `draft:${uuid}`;
}

function newRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
}

// ---------------------------------------------------------------------------
// 事件 reducer —— 纯函数，从老 useChatSession 的 handleEvent switch 抽出来
// ---------------------------------------------------------------------------

interface ReducerPatch {
  transcript?: TranscriptEntry[];
  sdkSessionId?: string;
  contextUsage?: ContextUsage | null;
  chatState?: ChatState;
  runStatus?: RunStatus;
  /** 要求 store 触发 summaryRefreshKey++，让侧边栏重拉 sessions.recent()。 */
  bumpSummary?: boolean;
  /** 要求立刻落盘（不经 debounce），session_finished 时为 true。 */
  flushPersist?: boolean;
  /** session_finished 时提示 store 清理订阅句柄。 */
  finished?: boolean;
  /** 整段事件未产生变化时为 true，store 可据此省略 emit。 */
  noop?: boolean;
}

export function reduceRuntime(runtime: SessionRuntime, event: ChatEvent, ts: number): ReducerPatch {
  const prev = runtime.transcript;

  switch (event.type) {
    case 'session_started':
      return {
        transcript: [...prev, { kind: 'status', ts, text: '研究已启动，自动运行中' }],
        bumpSummary: true,
      };
    case 'sdk_session_bound':
      return { sdkSessionId: event.sdkSessionId };
    case 'status_message': {
      const parsed = parseSubagentStatusMessage(event.text, ts);
      return { transcript: [...prev, parsed ?? { kind: 'status', ts, text: event.text }] };
    }
    case 'subagent': {
      if (event.phase === 'progress' && event.taskId) {
        const idx = findLastSubagentByTask(prev, event.taskId);
        const existing = idx >= 0 ? prev[idx] : undefined;
        if (existing && existing.kind === 'subagent' && existing.phase === 'progress') {
          const next = prev.slice();
          next[idx] = {
            ...existing,
            ts,
            text: event.text,
            description: event.description,
            lastToolName: event.lastToolName,
            toolUses: event.toolUses,
            durationMs: event.durationMs,
            totalTokens: event.totalTokens,
          };
          return { transcript: next };
        }
      }
      return {
        transcript: [
          ...prev,
          {
            kind: 'subagent',
            ts,
            phase: event.phase,
            text: event.text,
            taskId: event.taskId,
            description: event.description,
            lastToolName: event.lastToolName,
            toolUses: event.toolUses,
            durationMs: event.durationMs,
            totalTokens: event.totalTokens,
          },
        ],
      };
    }
    case 'session_finished': {
      const reason = event.reason;
      const text =
        reason === 'user_interrupt'
          ? '研究已暂停，等待你的指导'
          : reason === 'user_cancel'
            ? '研究已终止'
            : reason === 'error'
              ? '研究因错误中止'
              : '研究已完成当前自动运行';
      const nextRun: RunStatus =
        reason === 'user_interrupt'
          ? 'awaiting_user_guidance'
          : reason === 'user_cancel'
            ? 'cancelled'
            : reason === 'error'
              ? 'failed'
              : 'completed';
      return {
        transcript: [...prev, { kind: 'status', ts, text }],
        chatState: 'idle',
        runStatus: nextRun,
        contextUsage: null,
        bumpSummary: true,
        flushPersist: true,
        finished: true,
      };
    }
    case 'provider': {
      const label = event.providerLabel ?? (event.source === 'env' ? '环境变量回退' : '未命名');
      return {
        transcript: [
          ...prev,
          {
            kind: 'provider',
            ts,
            text: `使用 ${label} · ${event.model}${event.baseURL ? ` · ${event.baseURL}` : ''}`,
            providerId: event.providerId,
            providerLabel: event.providerLabel,
            model: event.model,
            baseURL: event.baseURL,
          },
        ],
      };
    }
    case 'user_message_accepted':
      return { transcript: [...prev, { kind: 'user', ts, text: event.text }] };
    case 'assistant_text': {
      const idx = event.messageId ? findLastAssistantByMessageId(prev, event.messageId) : -1;
      if (idx >= 0) {
        const existing = prev[idx];
        if (existing.kind === 'assistant') {
          const next = prev.slice();
          next[idx] = { ...existing, ts, text: event.text, messageId: event.messageId, streaming: false };
          return { transcript: next };
        }
      }
      return {
        transcript: [...prev, { kind: 'assistant', ts, text: event.text, messageId: event.messageId }],
      };
    }
    case 'assistant_text_delta': {
      const idx = findLastAssistantByMessageId(prev, event.messageId);
      if (idx >= 0) {
        const existing = prev[idx];
        if (existing.kind === 'assistant') {
          const next = prev.slice();
          next[idx] = { ...existing, text: `${existing.text}${event.delta}`, streaming: true };
          return { transcript: next };
        }
      }
      return {
        transcript: [
          ...prev,
          { kind: 'assistant', ts, text: event.delta, messageId: event.messageId, streaming: true },
        ],
      };
    }
    case 'assistant_thinking': {
      const idx = event.messageId ? findLastThinkingByMessageId(prev, event.messageId) : -1;
      if (idx >= 0) {
        const existing = prev[idx];
        if (existing.kind === 'thinking') {
          const next = prev.slice();
          next[idx] = { ...existing, ts, text: event.text };
          return { transcript: next };
        }
      }
      return {
        transcript: [...prev, { kind: 'thinking', ts, text: event.text, messageId: event.messageId }],
      };
    }
    case 'tool_use':
      return {
        transcript: [
          ...prev,
          {
            kind: 'tool_use',
            ts,
            name: event.name,
            input: event.input,
            toolUseId: event.toolUseId,
            parentToolUseId: event.parentToolUseId ?? null,
            status: 'running',
          },
        ],
      };
    case 'tool_progress': {
      const idx = findLastToolUseById(prev, event.toolUseId);
      if (idx < 0) return { noop: true };
      const existing = prev[idx];
      if (existing.kind !== 'tool_use') return { noop: true };
      const next = prev.slice();
      next[idx] = { ...existing, elapsedSeconds: event.elapsedSeconds, status: 'running' };
      return { transcript: next };
    }
    case 'tool_result': {
      let working = prev;
      if (event.toolUseId) {
        const idx = findLastToolUseById(prev, event.toolUseId);
        if (idx >= 0) {
          const existing = prev[idx];
          if (existing.kind === 'tool_use') {
            const next = prev.slice();
            next[idx] = { ...existing, status: 'done' };
            working = next;
          }
        }
      }
      return {
        transcript: [
          ...working,
          {
            kind: 'tool_result',
            ts,
            text: event.text,
            isError: event.isError,
            toolUseId: event.toolUseId,
          },
        ],
      };
    }
    case 'context_usage':
      return {
        contextUsage: {
          totalTokens: event.total_tokens,
          maxTokens: event.max_tokens,
          rawMaxTokens: event.raw_max_tokens,
          percentage: event.percentage,
          model: event.model,
          categories: event.categories,
        },
      };
    case 'error':
      return { transcript: [...prev, { kind: 'error', ts, text: event.message }] };
    case 'turn_result': {
      const parts: string[] = [];
      if (typeof event.num_turns === 'number') parts.push(`turns=${event.num_turns}`);
      if (typeof event.duration_ms === 'number') parts.push(`duration=${(event.duration_ms / 1000).toFixed(1)}s`);
      if (typeof event.cost_usd === 'number') parts.push(`cost=$${event.cost_usd.toFixed(4)}`);
      if (typeof event.total_tokens === 'number') parts.push(`tokens=${event.total_tokens}`);
      if (!event.ok && event.subtype) parts.push(`subtype=${event.subtype}`);
      if (!event.ok && event.errors?.length) parts.push(event.errors.join('; '));
      return {
        transcript: [
          ...prev,
          {
            kind: 'turn_result',
            ts,
            ok: event.ok,
            detail: parts.join(' · '),
            turns: event.num_turns,
            durationMs: event.duration_ms,
            costUsd: event.cost_usd,
            totalTokens: event.total_tokens,
            inputTokens: event.input_tokens,
            outputTokens: event.output_tokens,
            cacheCreationInputTokens: event.cache_creation_input_tokens,
            cacheReadInputTokens: event.cache_read_input_tokens,
          },
        ],
        chatState: 'waiting',
        runStatus: 'running',
        flushPersist: true,
      };
    }
    default:
      return { noop: true };
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface StoreSnapshot {
  /** 递增的"世代"号；只在状态变化时 bump，供 useSyncExternalStore 判脏。 */
  generation: number;
  foregroundKey: string | null;
  /** 所有运行中（chatState === 'running'）的 key 集合，侧边栏用。 */
  runningSessionIds: Set<string>;
  summaryRefreshKey: number;
}

export class SessionsStore {
  private runtimes = new Map<string, SessionRuntime>();
  private foregroundKey: string | null = null;
  private listeners = new Set<() => void>();
  private generation = 0;
  private summaryRefreshKey = 0;
  private cachedSnapshot: StoreSnapshot | null = null;

  // ---------- 订阅 ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreSnapshot => {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    const running = new Set<string>();
    for (const rt of this.runtimes.values()) {
      if (rt.chatState === 'running' && rt.sessionId) running.add(rt.sessionId);
    }
    const snap: StoreSnapshot = {
      generation: this.generation,
      foregroundKey: this.foregroundKey,
      runningSessionIds: running,
      summaryRefreshKey: this.summaryRefreshKey,
    };
    this.cachedSnapshot = snap;
    return snap;
  };

  /** 直接取某条 runtime 的只读引用。不用于 React 渲染（无订阅），用于 handler 读当前状态。 */
  peekRuntime(key: string | null): SessionRuntime | null {
    if (!key) return null;
    return this.runtimes.get(key) ?? null;
  }

  getForegroundRuntime(): SessionRuntime | null {
    return this.peekRuntime(this.foregroundKey);
  }

  // ---------- 生命周期：创建 / 切换 / 关闭 ----------

  /**
   * 串行化保证：同一时间最多只有前台会话在 running。切走当前前台前，如果它正
   * 在跑，先给它发一条 interrupt 让它优雅停到 awaiting_user_guidance。切回
   * 来时用户按 Enter 发新指导就会通过 chat:resume 继续（UI 已有相应提示）。
   *
   * 这是"一次只跑一个会话"的唯一可行实现——SDK 没有真正的"挂起"，只能
   * cancel 掉 sdk 子进程、用 sdk_session_id 复用累计上下文。切换开销 = 一次
   * 子进程重启；累积 token 都在 sdk session 侧保留。
   */
  private async suspendCurrentIfRunning(): Promise<void> {
    const current = this.getForegroundRuntime();
    if (!current || !current.sessionId) return;
    if (current.chatState !== 'running') return;
    try {
      await window.coase.chat.interrupt(current.sessionId);
    } catch (err) {
      console.warn('suspend current session failed', err);
    }
  }

  /**
   * 创建一个空白 draft runtime（"新会话"按钮触发）。如果当前前台正在跑，先把
   * 它挂起（interrupt）再切到 draft，保证同一时间只有一条会话 active。
   */
  async createDraft(): Promise<string> {
    await this.suspendCurrentIfRunning();
    const key = newDraftKey();
    this.runtimes.set(key, createEmptyRuntime(key));
    this.foregroundKey = key;
    this.bump();
    return key;
  }

  /** 切换前台视图；切走前先挂起当前 running 会话。 */
  async switchForeground(key: string | null): Promise<void> {
    if (this.foregroundKey === key) return;
    await this.suspendCurrentIfRunning();
    this.foregroundKey = key;
    this.bump();
  }

  /** 关闭并销毁 draft runtime；真 session 的 runtime 保留，只是 foreground 切走。 */
  dismissDraft(key: string): void {
    const rt = this.runtimes.get(key);
    if (!rt || !isDraftKey(key)) return;
    this.runtimes.delete(key);
    if (this.foregroundKey === key) this.foregroundKey = null;
    this.bump();
  }

  /**
   * 彻底释放一条 runtime（含订阅、待持久化定时器）。
   * 用户从侧边栏删除会话后调用，确保不残留事件监听 / 不再占内存。
   */
  disposeRuntime(key: string): void {
    const rt = this.runtimes.get(key);
    if (!rt) return;
    if (rt.unsubscribe) {
      try {
        rt.unsubscribe();
      } catch {
        // ignore
      }
    }
    if (rt.persistTimer) clearTimeout(rt.persistTimer);
    this.runtimes.delete(key);
    if (this.foregroundKey === key) this.foregroundKey = null;
    this.bump();
  }

  // ---------- composer 字段 patch（input / attachments / commands / workspace） ----------

  /**
   * 确保前台至少有一个 runtime；冷启动或刚 dispose 完时 foregroundKey 可能是 null，
   * 这时按需自动生成一个 draft 接住即将到来的输入。
   */
  private ensureForeground(): SessionRuntime {
    const existing = this.getForegroundRuntime();
    if (existing) return existing;
    const key = newDraftKey();
    const rt = createEmptyRuntime(key);
    this.runtimes.set(key, rt);
    this.foregroundKey = key;
    this.bump();
    return rt;
  }

  patchForeground(patch: Partial<SessionRuntime>): void {
    const rt = this.ensureForeground();
    this.patchRuntime(rt.key, patch);
  }

  private patchRuntime(key: string, patch: Partial<SessionRuntime>): void {
    const rt = this.runtimes.get(key);
    if (!rt) return;
    const next = { ...rt, ...patch };
    this.runtimes.set(key, next);
    this.bump();
  }

  setInput(value: string): void {
    this.patchForeground({ input: value });
  }

  addAttachments(kind: AttachmentKind, paths: string[]): void {
    if (paths.length === 0) return;
    const rt = this.ensureForeground();
    const known = new Set(rt.attachments.map((a) => `${a.kind}:${a.path}`));
    const next = [...rt.attachments];
    for (const path of paths) {
      const k = `${kind}:${path}`;
      if (known.has(k)) continue;
      next.push({
        id: newRunId(),
        kind,
        path,
        name: getPathName(path),
      });
      known.add(k);
    }
    this.patchRuntime(rt.key, { attachments: next });
  }

  removeAttachment(id: string): void {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    this.patchRuntime(rt.key, {
      attachments: rt.attachments.filter((a) => a.id !== id),
    });
  }

  addSelectedCommand(command: SelectedSlashCommand): void {
    const rt = this.ensureForeground();
    if (rt.selectedCommands.some((entry) => entry.id === command.id)) return;
    this.patchRuntime(rt.key, {
      selectedCommands: [...rt.selectedCommands, command],
    });
  }

  removeSelectedCommand(id: string): void {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    this.patchRuntime(rt.key, {
      selectedCommands: rt.selectedCommands.filter((c) => c.id !== id),
    });
  }

  clearSelectedCommands(): void {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    this.patchRuntime(rt.key, { selectedCommands: [] });
  }

  async chooseWorkspaceRoot(): Promise<void> {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    // 运行中的会话禁止改 workspace。
    if (rt.chatState === 'running') return;
    const picked = await window.coase.workspaces.pickDirectory();
    if (!picked) return;
    this.patchRuntime(rt.key, { workspaceRoot: picked, workspaceMode: 'custom' });
  }

  resetWorkspaceRoot(): void {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    this.patchRuntime(rt.key, { workspaceRoot: null, workspaceMode: 'auto' });
  }

  // ---------- 启动 / 续跑 / 追加 ----------

  /**
   * 从 foreground draft runtime 启动一个真会话（用户发首条消息）。
   * 完成后 foreground 会自动切到真 sessionId 对应的 runtime。
   */
  async startFromDraft(displayText: string, runtimeText: string): Promise<void> {
    // 前台可能为 null（冷启动/dispose 后），补一个 draft 兜底。
    const draft = this.ensureForeground();
    const key = draft.key;

    // 1. 乐观切到 running，让 UI 立刻反馈
    this.patchRuntime(key, {
      chatState: 'running',
      runStatus: 'running',
      transcript: [],
      runId: newRunId(),
      sdkSessionId: null,
      historicalCoaseSessionId: null,
    });

    try {
      const outcome = await window.coase.chat.start({
        text: runtimeText,
        displayText,
        attachments: draft.attachments.map(({ kind, path }) => ({ kind, path })),
        workspaceRoot:
          draft.workspaceMode === 'custom' ? draft.workspaceRoot ?? undefined : undefined,
      });

      // 2. 把 runtime 从 draft key 搬到 realSessionId key，同时清掉本次已发送
      //    的 attachments / selectedCommands（避免下一次 followup 误带）。
      this.migrateKey(key, outcome.sessionId, {
        sessionId: outcome.sessionId,
        workspaceRoot: outcome.workspaceRoot,
        firstPrompt: displayText.slice(0, 120),
        attachments: [],
        selectedCommands: [],
      });

      // 3. 挂事件订阅（每会话独立）
      this.attachEventStream(outcome.sessionId);
      this.bumpSummary();
    } catch (err) {
      this.patchRuntime(key, {
        chatState: 'idle',
        runStatus: 'failed',
        transcript: [
          ...(this.runtimes.get(key)?.transcript ?? []),
          { kind: 'error', ts: Date.now(), text: err instanceof Error ? err.message : String(err) },
        ],
      });
    }
  }

  /** Followup 消息（当前 runtime 处于 waiting / running）。 */
  async sendFollowup(displayText: string, runtimeText: string): Promise<void> {
    const rt = this.getForegroundRuntime();
    if (!rt || !rt.sessionId) return;
    const sid = rt.sessionId;
    this.patchRuntime(rt.key, { chatState: 'running', runStatus: 'running' });
    try {
      await window.coase.chat.send(sid, {
        text: runtimeText,
        displayText,
        attachments: rt.attachments.map(({ kind, path }) => ({ kind, path })),
      });
      this.patchRuntime(rt.key, { attachments: [] });
    } catch (err) {
      this.patchRuntime(rt.key, {
        chatState: 'waiting',
        runStatus: 'failed',
        transcript: [
          ...(this.runtimes.get(rt.key)?.transcript ?? []),
          { kind: 'error', ts: Date.now(), text: err instanceof Error ? err.message : String(err) },
        ],
      });
    }
  }

  /**
   * 从 awaiting_user_guidance 状态续跑：会话已经 finished、但用户按 Enter 发新指导。
   * 主进程会复用原 coaseSessionId、workspace、累计统计。
   */
  async resumeFromForeground(displayText: string, runtimeText: string): Promise<void> {
    const rt = this.getForegroundRuntime();
    if (!rt) return;
    const payload: ChatResumeInput = {
      sdkSessionId: rt.sdkSessionId ?? '',
      coaseSessionId: rt.historicalCoaseSessionId ?? rt.sessionId ?? undefined,
      guidance: runtimeText,
      displayGuidance: displayText,
      attachments: rt.attachments.map(({ kind, path }) => ({ kind, path })),
      workspaceRoot: rt.workspaceMode === 'custom' ? rt.workspaceRoot ?? undefined : undefined,
    };

    // 插入一条可见的 guidance entry
    this.patchRuntime(rt.key, {
      chatState: 'running',
      runStatus: 'running',
      runId: newRunId(),
      transcript: [...rt.transcript, { kind: 'guidance', ts: Date.now(), text: displayText }],
    });

    try {
      const outcome = await window.coase.chat.resume(payload);
      // 续跑返回的 sessionId 应该等于 coaseSessionId（复用）。如果 runtime 当前 key
      // 不是这个 id（例如 resume 的是磁盘载入的历史），就重挂到正确 key。
      if (rt.key !== outcome.sessionId) {
        this.migrateKey(rt.key, outcome.sessionId, {
          sessionId: outcome.sessionId,
          historicalCoaseSessionId: outcome.sessionId,
          workspaceRoot: outcome.workspaceRoot,
        });
      } else {
        this.patchRuntime(rt.key, {
          sessionId: outcome.sessionId,
          historicalCoaseSessionId: outcome.sessionId,
          workspaceRoot: outcome.workspaceRoot,
          attachments: [],
        });
      }
      this.attachEventStream(outcome.sessionId);
      this.bumpSummary();
    } catch (err) {
      this.patchRuntime(rt.key, {
        chatState: 'idle',
        runStatus: 'failed',
        transcript: [
          ...(this.runtimes.get(rt.key)?.transcript ?? []),
          { kind: 'error', ts: Date.now(), text: err instanceof Error ? err.message : String(err) },
        ],
      });
    }
  }

  async cancelForeground(): Promise<void> {
    const rt = this.getForegroundRuntime();
    if (!rt || !rt.sessionId) return;
    await window.coase.chat.cancel(rt.sessionId);
  }

  async interruptForeground(): Promise<void> {
    const rt = this.getForegroundRuntime();
    if (!rt || !rt.sessionId) return;
    await window.coase.chat.interrupt(rt.sessionId);
  }

  // ---------- 历史会话 ----------

  /**
   * 纯浏览打开：把磁盘 transcript 读进 runtime，切 foreground 过去。不订阅事件
   * （这条会话在后端并不 active）。如果 runtime 里已经有同 id 的活跃条目，直接
   * 切视图而不是重新读磁盘——那才是真正的"切回后台会话"语义。
   */
  async openHistoricalView(entry: SessionLogEntry): Promise<void> {
    const existing = this.runtimes.get(entry.sessionId);
    if (existing) {
      await this.switchForeground(entry.sessionId);
      return;
    }

    // 同 switchForeground：切走前挂起前台 running 会话
    await this.suspendCurrentIfRunning();

    const history = await window.coase.sessions.transcript(entry.sessionId);
    const transcript = finalizeHistoricalTranscript(history as TranscriptEntry[]);
    const workspaceRoot =
      entry.workspaceRoot ?? (await window.coase.workspaces.getRoot(entry.sessionId));

    const rt: SessionRuntime = {
      ...createEmptyRuntime(entry.sessionId),
      sessionId: entry.sessionId,
      sdkSessionId: entry.sdkSessionId ?? null,
      historicalCoaseSessionId: entry.sessionId,
      transcript,
      chatState: 'idle',
      runStatus: 'idle',
      workspaceRoot,
      workspaceMode: workspaceRoot ? 'custom' : 'auto',
      firstPrompt: entry.firstPrompt,
    };
    this.runtimes.set(entry.sessionId, rt);
    this.foregroundKey = entry.sessionId;
    this.bumpSummary();
    this.bump();
  }

  /**
   * 打开历史会话并准备续跑：与 openHistoricalView 类似，但 runStatus 设成
   * awaiting_user_guidance，用户按 Enter 会走 resumeFromForeground。
   */
  async openHistoricalForResume(entry: SessionLogEntry): Promise<void> {
    if (!entry.sdkSessionId) {
      throw new Error('该历史会话没有可恢复的 Claude 原生会话 ID');
    }

    const existing = this.runtimes.get(entry.sessionId);
    if (existing) {
      this.patchRuntime(entry.sessionId, { runStatus: 'awaiting_user_guidance' });
      await this.switchForeground(entry.sessionId);
      return;
    }

    await this.suspendCurrentIfRunning();

    const history = await window.coase.sessions.transcript(entry.sessionId);
    const transcript = finalizeHistoricalTranscript(history as TranscriptEntry[]);
    const workspaceRoot =
      entry.workspaceRoot ?? (await window.coase.workspaces.getRoot(entry.sessionId));

    const rt: SessionRuntime = {
      ...createEmptyRuntime(entry.sessionId),
      sessionId: entry.sessionId,
      sdkSessionId: entry.sdkSessionId,
      historicalCoaseSessionId: entry.sessionId,
      transcript,
      chatState: 'idle',
      runStatus: 'awaiting_user_guidance',
      workspaceRoot,
      workspaceMode: 'custom',
      runId: newRunId(),
      firstPrompt: entry.firstPrompt,
    };
    this.runtimes.set(entry.sessionId, rt);
    this.foregroundKey = entry.sessionId;
    this.bumpSummary();
    this.bump();
  }

  // ---------- 内部：key 迁移、事件订阅、持久化 ----------

  private migrateKey(fromKey: string, toKey: string, patch: Partial<SessionRuntime>): void {
    if (fromKey === toKey) return;
    const rt = this.runtimes.get(fromKey);
    if (!rt) return;
    const next: SessionRuntime = { ...rt, ...patch, key: toKey };
    this.runtimes.delete(fromKey);
    this.runtimes.set(toKey, next);
    if (this.foregroundKey === fromKey) this.foregroundKey = toKey;
    this.bump();
  }

  private attachEventStream(sessionId: string): void {
    const rt = this.runtimes.get(sessionId);
    if (!rt) return;
    // 幂等：已有订阅就先解掉（避免重复挂）
    if (rt.unsubscribe) {
      try {
        rt.unsubscribe();
      } catch {
        // ignore
      }
    }
    const unsub = window.coase.chat.onEvent(sessionId, (event) => {
      this.handleChatEvent(sessionId, event);
    });
    this.patchRuntime(sessionId, { unsubscribe: unsub });
  }

  private handleChatEvent(sessionId: string, event: ChatEvent): void {
    const rt = this.runtimes.get(sessionId);
    if (!rt) return;
    const patch = reduceRuntime(rt, event, Date.now());
    if (patch.noop) return;

    const merged: SessionRuntime = { ...rt };
    if (patch.transcript) merged.transcript = patch.transcript;
    if (patch.sdkSessionId !== undefined) merged.sdkSessionId = patch.sdkSessionId;
    if (patch.contextUsage !== undefined) merged.contextUsage = patch.contextUsage;
    if (patch.chatState) merged.chatState = patch.chatState;
    if (patch.runStatus) merged.runStatus = patch.runStatus;
    this.runtimes.set(sessionId, merged);

    if (patch.finished) {
      // 会话结束后保留 runtime（供用户切回查看），但解掉订阅释放 IPC 监听。
      if (merged.unsubscribe) {
        try {
          merged.unsubscribe();
        } catch {
          // ignore
        }
        this.runtimes.set(sessionId, { ...merged, unsubscribe: null });
      }
    }

    if (patch.bumpSummary) this.summaryRefreshKey += 1;

    // 持久化：event-level debounce；session_finished / turn_result 立刻 flush。
    if (patch.transcript) {
      this.schedulePersist(sessionId, { flushNow: patch.flushPersist === true });
    }

    this.bump();
  }

  private schedulePersist(sessionId: string, opts?: { flushNow?: boolean }): void {
    const rt = this.runtimes.get(sessionId);
    if (!rt || !rt.sessionId) return;
    if (rt.persistTimer) {
      clearTimeout(rt.persistTimer);
      this.runtimes.set(sessionId, { ...rt, persistTimer: null });
    }

    const flush = () => {
      const current = this.runtimes.get(sessionId);
      if (!current || !current.sessionId) return;
      const snapshot = current.transcript;
      if (snapshot.length === 0) return;
      void window.coase.sessions
        .persistTranscript(current.sessionId, snapshot as TranscriptEntryPersisted[])
        .catch((err) => console.warn('persistTranscript failed', { sessionId, err }));
      void window.coase.sessions
        .persistInsights(current.sessionId, deriveRunInsights(snapshot) as RunInsightsPersisted)
        .catch((err) => console.warn('persistInsights failed', { sessionId, err }));
      // 清 timer
      const latest = this.runtimes.get(sessionId);
      if (latest?.persistTimer) {
        this.runtimes.set(sessionId, { ...latest, persistTimer: null });
      }
    };

    if (opts?.flushNow) {
      flush();
      return;
    }
    const timer = setTimeout(flush, 500);
    this.runtimes.set(sessionId, { ...rt, persistTimer: timer });
  }

  // ---------- 发射 ----------

  private bump(): void {
    this.generation += 1;
    this.cachedSnapshot = null;
    for (const listener of this.listeners) listener();
  }

  private bumpSummary(): void {
    this.summaryRefreshKey += 1;
    this.bump();
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

export function isDraftKey(key: string): boolean {
  return key.startsWith('draft:');
}

export function withAttachmentSummary(text: string, attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return text;
  const summary = attachments
    .map((attachment) => `${attachmentLabel(attachment.kind)}：${attachment.name}`)
    .join('；');
  return `${text}\n\n附加资料：${summary}`;
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

function getPathName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function findLastAssistantByMessageId(
  transcript: TranscriptEntry[],
  messageId: string,
): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'assistant' && entry.messageId === messageId) return i;
  }
  return -1;
}

function findLastToolUseById(transcript: TranscriptEntry[], toolUseId: string): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'tool_use' && entry.toolUseId === toolUseId) return i;
  }
  return -1;
}

function findLastSubagentByTask(transcript: TranscriptEntry[], taskId: string): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'subagent' && entry.taskId === taskId) return i;
  }
  return -1;
}

function findLastThinkingByMessageId(
  transcript: TranscriptEntry[],
  messageId: string,
): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'thinking' && entry.messageId === messageId) return i;
  }
  return -1;
}

function parseSubagentStatusMessage(text: string, ts: number): TranscriptEntry | null {
  const mappings: Array<{
    prefix: string;
    phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
  }> = [
    { prefix: '子代理开始：', phase: 'started' },
    { prefix: '子代理进度：', phase: 'progress' },
    { prefix: '子代理完成：', phase: 'completed' },
    { prefix: '子代理失败：', phase: 'failed' },
    { prefix: '子代理停止：', phase: 'stopped' },
  ];

  for (const mapping of mappings) {
    if (text.startsWith(mapping.prefix)) {
      return {
        kind: 'subagent',
        ts,
        phase: mapping.phase,
        text: text.slice(mapping.prefix.length).trim() || mapping.prefix.replace('：', ''),
      };
    }
  }

  return null;
}

/**
 * 磁盘载入的 transcript 里，跑到一半被中断的 tool_use / streaming 条目要"落地"
 * 成终态——否则 UI 会继续显示秒表、打字动画，但实际上主进程已无事件产出。
 */
function finalizeHistoricalTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.map((entry) => {
    if (entry.kind === 'tool_use' && entry.status === 'running') {
      return { ...entry, status: 'done' };
    }
    if (entry.kind === 'assistant' && entry.streaming) {
      return { ...entry, streaming: false };
    }
    return entry;
  });
}

export { injectSlashCommandContext };

// 全局单例。Renderer 里只有一份 store；main 进程的 activeSessions map 是另一份，
// 两者通过 chat:attach/detach/event IPC 对应。
export const sessionsStore = new SessionsStore();

