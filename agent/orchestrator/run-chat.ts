// Chat 会话编排器：把 Claude Agent SDK 的消息流翻译成 Coase 的 ChatEvent。
import { appendSessionLog } from '../logging/session-log';
import {
  buildRuntimeErrorLogEntry,
  describeError,
} from '../logging/runtime-error-format';
import {
  appendRuntimeErrorLog,
  getRuntimeErrorLogPath,
} from '../logging/runtime-error-log';
import { PromptQueue } from '../chat/prompt-queue';
import { createChatQuery } from '../sdk/client';
import {
  NoProviderConfiguredError,
  UnsupportedProtocolError,
  type ResolvedProvider,
} from '../providers/resolve';
import type { ChatEvent } from '../../shared/ipc';
import type { SessionLogEntry } from '../../shared/runs';

export interface RunChatSessionParams {
  sessionId: string;
  firstMessage: string;
  runtimeMessage?: string;
  workspaceRoot: string;
  queue: PromptQueue;
  onEvent: (event: ChatEvent) => void;
  signal?: AbortSignal;
  showFirstMessage?: boolean;
  resumeSessionId?: string;
}

export interface ChatSessionHandle {
  sendUserMessage(text: string, runtimeText?: string): void;
  cancel(reason: 'user_cancel' | 'user_interrupt' | 'error'): void;
  getStats(): SessionStats;
  done: Promise<void>;
}

export interface SessionStats {
  sdkSessionId?: string;
  userMessageCount: number;
  agentTurnCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
  ok: boolean;
  lastError?: string;
}

export async function startChatSession(
  params: RunChatSessionParams,
): Promise<ChatSessionHandle> {
  const {
    sessionId,
    firstMessage,
    runtimeMessage,
    workspaceRoot,
    queue,
    onEvent,
    signal,
    showFirstMessage = true,
    resumeSessionId,
  } = params;
  const startedAt = Date.now();

  onEvent({ type: 'session_started', firstPrompt: firstMessage });

  queue.push(runtimeMessage ?? firstMessage);
  if (showFirstMessage) {
    onEvent({ type: 'user_message_accepted', text: firstMessage });
  }

  const internalAbort = new AbortController();
  const stderrChunks: string[] = [];
  if (signal) {
    if (signal.aborted) {
      internalAbort.abort();
    } else {
      signal.addEventListener('abort', () => internalAbort.abort(), { once: true });
    }
  }

  let bundle: Awaited<ReturnType<typeof createChatQuery>>;
  try {
    bundle = await createChatQuery({
      queue,
      signal: internalAbort.signal,
      resume: resumeSessionId,
      cwd: workspaceRoot,
      onStderr: (data) => {
        if (!data) return;
        stderrChunks.push(data);
        if (stderrChunks.length > 200) {
          stderrChunks.splice(0, stderrChunks.length - 200);
        }
      },
    });
  } catch (err) {
    const errorLogPath = await safeAppendRuntimeErrorLog(
      buildRuntimeErrorLogEntry({
        phase: 'create_query',
        sessionId,
        workspaceRoot,
        firstPrompt: truncate(firstMessage, 500),
        error: err,
        stderr: joinStderr(stderrChunks),
      }),
    );
    const message =
      err instanceof NoProviderConfiguredError || err instanceof UnsupportedProtocolError
        ? err.message
        : formatRuntimeErrorMessage('初始化 chat 失败', err, errorLogPath);
    onEvent({ type: 'error', message });
    onEvent({ type: 'session_finished', reason: 'error' });
    await safeAppendLog({
      sessionId,
      finishReason: 'error',
      startedAt,
      endedAt: Date.now(),
      firstPrompt: truncate(firstMessage, 120),
      providerSource: 'env',
      model: '(unresolved)',
      userMessageCount: 1,
      agentTurnCount: 0,
      totalDurationMs: 0,
      totalCostUsd: 0,
      totalTokens: 0,
      ok: false,
      errorMessage: message,
    });
    return makeDeadHandle();
  }

  const { query: sdkQuery, provider } = bundle;

  await ensurePluginsReady(sdkQuery, onEvent);

  onEvent({
    type: 'provider',
    source: provider.source,
    providerId: provider.providerId,
    providerLabel: provider.providerLabel,
    model: provider.model,
    baseURL: provider.baseURL,
  });

  void announceSupportedAgents(sdkQuery, onEvent);

  const stats: SessionStats = {
    sdkSessionId: resumeSessionId,
    userMessageCount: 1,
    agentTurnCount: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalTokens: 0,
    ok: true,
  };

  let finalizeReason: 'user_cancel' | 'user_interrupt' | 'agent_done' | 'error' = 'agent_done';
  let lastContextEmitAt = 0;
  const streamState = new StreamingTextBuffers(onEvent);

  const mainLoop = (async () => {
    try {
      for await (const message of sdkQuery) {
        bindSdkSessionOnce(message, stats, onEvent);
        translate(message, stats, onEvent, streamState);

        const now = Date.now();
        if (message.type === 'result' || now - lastContextEmitAt >= 1200) {
          lastContextEmitAt = now;
          void maybeEmitContextPressure(sdkQuery, onEvent);
        }
      }
    } catch (err) {
      const errorLogPath = await safeAppendRuntimeErrorLog(
        buildRuntimeErrorLogEntry({
          phase: 'run_loop',
          sessionId,
          sdkSessionId: stats.sdkSessionId,
          workspaceRoot,
          firstPrompt: truncate(firstMessage, 500),
          provider,
          error: err,
          stderr: joinStderr(stderrChunks),
        }),
      );
      const runtimeError = formatRuntimeErrorMessage('运行期错误', err, errorLogPath);
      stats.ok = false;
      stats.lastError = runtimeError;
      finalizeReason = 'error';
      onEvent({ type: 'error', message: runtimeError });
    } finally {
      streamState.flushAll();
      onEvent({ type: 'session_finished', reason: finalizeReason });
      await safeAppendLog(
        buildSessionLog(
          sessionId,
          startedAt,
          firstMessage,
          provider,
          stats,
          finalizeReason,
          workspaceRoot,
        ),
      );
    }
  })();

  return {
    sendUserMessage(text: string, runtimeText?: string): void {
      queue.push(runtimeText ?? text);
      stats.userMessageCount += 1;
      onEvent({ type: 'user_message_accepted', text });
    },
    cancel(reason): void {
      finalizeReason = reason;
      if (reason === 'user_cancel' || reason === 'user_interrupt') {
        stats.ok = false;
        stats.lastError = reason === 'user_interrupt' ? 'interrupted by user' : 'cancelled by user';
      }
      queue.end();
      try {
        sdkQuery.close();
      } catch {
        // ignore
      }
      internalAbort.abort();
    },
    getStats(): SessionStats {
      return { ...stats };
    },
    done: mainLoop,
  };
}

type SDKMessageLike = {
  type: string;
  session_id?: string;
  subtype?: string;
  [key: string]: unknown;
};

function bindSdkSessionOnce(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
): void {
  if (stats.sdkSessionId || typeof message.session_id !== 'string' || !message.session_id) {
    return;
  }
  stats.sdkSessionId = message.session_id;
  onEvent({ type: 'sdk_session_bound', sdkSessionId: message.session_id });
}

function translate(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
  streamState: StreamingTextBuffers,
): void {
  switch (message.type) {
    case 'assistant':
      handleAssistant(message, onEvent, streamState);
      return;
    case 'user':
      handleUserToolResult(message, onEvent);
      return;
    case 'result':
      handleResult(message, stats, onEvent);
      return;
    case 'system':
      handleSystem(message, onEvent);
      return;
    case 'stream_event':
      handleStreamEvent(message, streamState);
      return;
    case 'tool_progress':
      handleToolProgress(message, onEvent);
      return;
    case 'rate_limit_event':
      handleRateLimit(message, onEvent);
      return;
    default:
      return;
  }
}

interface AssistantBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
  thinking?: string;
}

function handleAssistant(
  message: SDKMessageLike,
  onEvent: (event: ChatEvent) => void,
  streamState: StreamingTextBuffers,
): void {
  const inner = message.message as { id?: string; content?: AssistantBlock[] } | undefined;
  const blocks = inner?.content;
  const messageId = typeof inner?.id === 'string' ? inner.id : undefined;
  const parentToolUseId =
    typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null;

  // Finalize any streaming buffer for this message (the assistant message
  // carries authoritative text; we replace the streaming fragment with it).
  if (messageId) streamState.finalize(messageId);

  if (!Array.isArray(blocks)) return;

  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      onEvent({
        type: 'assistant_text',
        text: block.text,
        messageId,
        parentToolUseId,
      });
    } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
      onEvent({
        type: 'assistant_thinking',
        text: block.thinking,
        messageId,
        parentToolUseId,
      });
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      onEvent({
        type: 'tool_use',
        name: block.name,
        input: block.input ?? null,
        toolUseId: typeof block.id === 'string' ? block.id : undefined,
        parentToolUseId,
      });
    }
  }
}

interface ToolResultContentBlock {
  type: string;
  text?: string;
}

interface ToolResultBlock {
  type: string;
  tool_use_id?: string;
  content?: string | ToolResultContentBlock[];
  is_error?: boolean;
}

function handleUserToolResult(
  message: SDKMessageLike,
  onEvent: (event: ChatEvent) => void,
): void {
  const inner = message.message as { content?: ToolResultBlock[] | string } | undefined;
  const content = inner?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block.type !== 'tool_result') continue;
    const text = extractToolResultText(block.content);
    onEvent({
      type: 'tool_result',
      text,
      isError: block.is_error === true,
      toolUseId: typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined,
    });
  }
}

function extractToolResultText(content: ToolResultBlock['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('');
}

type UsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

function handleResult(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
): void {
  const subtype = message.subtype as string | undefined;
  const costUsd = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined;
  const durationMs = typeof message.duration_ms === 'number' ? message.duration_ms : undefined;
  const numTurns = typeof message.num_turns === 'number' ? message.num_turns : undefined;
  const usage = (message.usage ?? {}) as UsageLike;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
  const totalTokens =
    inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens || undefined;

  if (typeof costUsd === 'number') stats.totalCostUsd += costUsd;
  if (typeof durationMs === 'number') stats.totalDurationMs += durationMs;
  if (typeof numTurns === 'number') stats.agentTurnCount += numTurns;
  if (typeof totalTokens === 'number') stats.totalTokens += totalTokens;

  if (subtype === 'success') {
    onEvent({
      type: 'turn_result',
      ok: true,
      cost_usd: costUsd,
      duration_ms: durationMs,
      num_turns: numTurns,
      total_tokens: totalTokens,
      input_tokens: inputTokens || undefined,
      output_tokens: outputTokens || undefined,
      cache_creation_input_tokens: cacheCreationInputTokens || undefined,
      cache_read_input_tokens: cacheReadInputTokens || undefined,
    });
    return;
  }

  stats.ok = false;
  const errors = Array.isArray(message.errors) ? (message.errors as string[]) : [];
  stats.lastError = errors.join('; ') || subtype || 'unknown';
  onEvent({
    type: 'turn_result',
    ok: false,
    cost_usd: costUsd,
    duration_ms: durationMs,
    num_turns: numTurns,
    total_tokens: totalTokens,
    input_tokens: inputTokens || undefined,
    output_tokens: outputTokens || undefined,
    cache_creation_input_tokens: cacheCreationInputTokens || undefined,
    cache_read_input_tokens: cacheReadInputTokens || undefined,
    subtype,
    errors,
  });
}

function handleSystem(message: SDKMessageLike, onEvent: (event: ChatEvent) => void): void {
  switch (message.subtype) {
    case 'init': {
      return;
    }
    case 'hook_response': {
      const hookName = typeof message.hook_name === 'string' ? message.hook_name : 'hook';
      const hookEvent = typeof message.hook_event === 'string' ? message.hook_event : 'unknown';
      const outcome = typeof message.outcome === 'string' ? message.outcome : 'success';
      if (outcome === 'error') {
        onEvent({
          type: 'status_message',
          text: `${hookName}（${hookEvent}）执行失败`,
        });
      }
      return;
    }
    case 'task_started': {
      if (message.skip_transcript === true) return;
      const description =
        typeof message.description === 'string' ? message.description : '子任务已启动';
      onEvent({
        type: 'subagent',
        phase: 'started',
        text: description,
        taskId: typeof message.task_id === 'string' ? message.task_id : undefined,
        description,
      });
      return;
    }
    case 'task_progress': {
      const description = typeof message.description === 'string' ? message.description : undefined;
      const summary =
        typeof message.summary === 'string'
          ? message.summary
          : description ?? '子代理正在处理任务';
      const lastToolName =
        typeof message.last_tool_name === 'string' ? message.last_tool_name : undefined;
      const usage = (message.usage ?? {}) as {
        total_tokens?: number;
        tool_uses?: number;
        duration_ms?: number;
      };
      onEvent({
        type: 'subagent',
        phase: 'progress',
        text: summary,
        taskId: typeof message.task_id === 'string' ? message.task_id : undefined,
        description,
        lastToolName,
        toolUses: typeof usage.tool_uses === 'number' ? usage.tool_uses : undefined,
        durationMs: typeof usage.duration_ms === 'number' ? usage.duration_ms : undefined,
        totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
      });
      return;
    }
    case 'task_notification': {
      if (message.skip_transcript === true) return;
      const phase: 'completed' | 'failed' | 'stopped' =
        message.status === 'completed'
          ? 'completed'
          : message.status === 'failed'
            ? 'failed'
            : 'stopped';
      const summary = typeof message.summary === 'string' ? message.summary : '子代理任务已结束';
      const usage = (message.usage ?? {}) as {
        total_tokens?: number;
        tool_uses?: number;
        duration_ms?: number;
      };
      onEvent({
        type: 'subagent',
        phase,
        text: summary,
        taskId: typeof message.task_id === 'string' ? message.task_id : undefined,
        toolUses: typeof usage.tool_uses === 'number' ? usage.tool_uses : undefined,
        durationMs: typeof usage.duration_ms === 'number' ? usage.duration_ms : undefined,
        totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
      });
      return;
    }
    case 'task_updated': {
      // Patch-only updates; forward meaningful description changes as a progress tick.
      const patch = message.patch as { description?: string; status?: string } | undefined;
      if (!patch) return;
      const desc = typeof patch.description === 'string' ? patch.description : undefined;
      if (!desc) return;
      onEvent({
        type: 'subagent',
        phase: 'progress',
        text: desc,
        taskId: typeof message.task_id === 'string' ? message.task_id : undefined,
        description: desc,
      });
      return;
    }
    case 'session_state_changed': {
      if (message.state === 'requires_action') {
        onEvent({ type: 'status_message', text: '当前会话需要进一步操作或输入' });
      }
      return;
    }
    case 'memory_recall': {
      const memories = Array.isArray(message.memories) ? message.memories.length : 0;
      if (memories > 0) {
        onEvent({ type: 'status_message', text: `已从记忆中召回 ${memories} 条相关内容` });
      }
      return;
    }
    case 'compact_boundary': {
      // SDK 的 auto-compact 跑完后会发一条 compact_boundary system message。
      // 这里把它转成前端可见的 status，以便用户知道「Coase 会自动管理背景信息
      // 窗口」这件事确实在发生，而不是只贴个静态 tooltip。
      const meta = (message.compact_metadata ?? {}) as {
        trigger?: string;
        pre_tokens?: number;
        post_tokens?: number;
      };
      const trigger = meta.trigger === 'manual' ? '手动' : '自动';
      const preK = typeof meta.pre_tokens === 'number' ? Math.round(meta.pre_tokens / 1000) : null;
      const postK =
        typeof meta.post_tokens === 'number' ? Math.round(meta.post_tokens / 1000) : null;
      const delta = preK !== null && postK !== null ? `：${preK}k → ${postK}k` : '';
      onEvent({
        type: 'status_message',
        text: `已${trigger}压缩上下文${delta}`,
      });
      return;
    }
    case 'notification': {
      if (typeof message.text === 'string' && message.text.trim()) {
        onEvent({ type: 'status_message', text: message.text.trim() });
      }
      return;
    }
    default:
      return;
  }
}

function handleRateLimit(message: SDKMessageLike, onEvent: (event: ChatEvent) => void): void {
  const info = message.rate_limit_info as { status?: string } | undefined;
  if (!info?.status || info.status === 'allowed') return;
  onEvent({
    type: 'status_message',
    text: info.status === 'allowed_warning' ? '当前速率接近限制' : '当前请求触发速率限制',
  });
}

function handleToolProgress(
  message: SDKMessageLike,
  onEvent: (event: ChatEvent) => void,
): void {
  const toolUseId = typeof message.tool_use_id === 'string' ? message.tool_use_id : undefined;
  const toolName = typeof message.tool_name === 'string' ? message.tool_name : undefined;
  const elapsed =
    typeof message.elapsed_time_seconds === 'number' ? message.elapsed_time_seconds : undefined;
  if (!toolUseId || !toolName || elapsed === undefined) return;
  onEvent({
    type: 'tool_progress',
    toolUseId,
    toolName,
    elapsedSeconds: elapsed,
    parentToolUseId:
      typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null,
  });
}

/**
 * Aggregates partial text/thinking deltas from SDK `stream_event` messages
 * and emits rate-limited `assistant_text_delta` / `assistant_thinking` events
 * so the UI can render live typing without one IPC call per token.
 *
 * Text ownership: the authoritative text always arrives on the subsequent
 * `assistant` SDK message (with the same message.id). We only use this buffer
 * to make the interim period visible; `finalize(messageId)` clears it so the
 * renderer can replace the streaming fragment with the final text.
 */
interface StreamBlockKind {
  kind: 'text' | 'thinking';
}

class StreamingTextBuffers {
  // Per-message buffer state (keyed by Anthropic message.id from message_start).
  //
  // `pendingText` is an INCREMENTAL delta that gets cleared after each flush
  // because the renderer appends it to the streaming entry.
  //
  // `cumulativeThinking` is the FULL thinking text so far; on flush we send
  // the whole thing as an `assistant_thinking` event and the renderer replaces
  // (not appends) the pill content. This keeps replay/dedupe simple.
  //
  // `thinkingDirty` tracks whether cumulative thinking has grown since last
  // flush so we only re-emit when something changed.
  private readonly messages = new Map<
    string,
    {
      parentToolUseId: string | null;
      blocks: Map<number, StreamBlockKind>;
      pendingText: string;
      cumulativeThinking: string;
      thinkingDirty: boolean;
      timer: NodeJS.Timeout | null;
    }
  >();

  // Current streaming message id per parent_tool_use_id context.
  // Stream events after `message_start` only carry `index`, not the message
  // id, so we have to remember which id the main agent (`null`) and each
  // subagent (their parent tool_use_id) last started.
  private readonly currentByParent = new Map<string, string>();

  // Anything shorter than this stays buffered so we don't spam IPC.
  private static readonly MIN_FLUSH_MS = 120;

  constructor(private readonly onEvent: (event: ChatEvent) => void) {}

  handleMessageStart(messageId: string, parentToolUseId: string | null): void {
    if (!this.messages.has(messageId)) {
      this.messages.set(messageId, {
        parentToolUseId,
        blocks: new Map(),
        pendingText: '',
        cumulativeThinking: '',
        thinkingDirty: false,
        timer: null,
      });
    }
    this.currentByParent.set(parentKey(parentToolUseId), messageId);
  }

  handleBlockStart(
    parentToolUseId: string | null,
    index: number,
    blockType: string,
  ): void {
    const messageId = this.currentByParent.get(parentKey(parentToolUseId));
    if (!messageId) return;
    const state = this.messages.get(messageId);
    if (!state) return;
    if (blockType === 'text') state.blocks.set(index, { kind: 'text' });
    else if (blockType === 'thinking') state.blocks.set(index, { kind: 'thinking' });
  }

  handleDelta(
    parentToolUseId: string | null,
    index: number,
    delta: { type?: string; text?: string; thinking?: string },
  ): void {
    const messageId = this.currentByParent.get(parentKey(parentToolUseId));
    if (!messageId) return;
    const state = this.messages.get(messageId);
    if (!state) return;
    const block = state.blocks.get(index);
    if (!block) return;
    if (block.kind === 'text' && delta.type === 'text_delta' && typeof delta.text === 'string') {
      state.pendingText += delta.text;
      this.scheduleFlush(messageId);
    } else if (
      block.kind === 'thinking' &&
      delta.type === 'thinking_delta' &&
      typeof delta.thinking === 'string'
    ) {
      state.cumulativeThinking += delta.thinking;
      state.thinkingDirty = true;
      this.scheduleFlush(messageId);
    }
  }

  /**
   * Called when an authoritative `assistant` SDK message with this messageId
   * arrives. Drop the buffer entirely so the renderer will replace the
   * streaming fragment with the final text emitted alongside.
   */
  finalize(messageId: string): void {
    const state = this.messages.get(messageId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    this.messages.delete(messageId);
    const key = parentKey(state.parentToolUseId);
    if (this.currentByParent.get(key) === messageId) {
      this.currentByParent.delete(key);
    }
  }

  flushAll(): void {
    for (const [messageId, state] of this.messages.entries()) {
      this.flush(messageId, state);
      if (state.timer) clearTimeout(state.timer);
    }
    this.messages.clear();
    this.currentByParent.clear();
  }

  private scheduleFlush(messageId: string): void {
    const state = this.messages.get(messageId);
    if (!state || state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      this.flush(messageId, state);
    }, StreamingTextBuffers.MIN_FLUSH_MS);
  }

  private flush(
    messageId: string,
    state: {
      parentToolUseId: string | null;
      pendingText: string;
      cumulativeThinking: string;
      thinkingDirty: boolean;
    },
  ): void {
    if (state.pendingText) {
      this.onEvent({
        type: 'assistant_text_delta',
        messageId,
        delta: state.pendingText,
        parentToolUseId: state.parentToolUseId,
      });
      state.pendingText = '';
    }
    if (state.thinkingDirty) {
      this.onEvent({
        type: 'assistant_thinking',
        messageId,
        text: state.cumulativeThinking,
        parentToolUseId: state.parentToolUseId,
      });
      state.thinkingDirty = false;
    }
  }
}

function parentKey(parentToolUseId: string | null): string {
  return parentToolUseId ?? '__main__';
}

function handleStreamEvent(
  message: SDKMessageLike,
  streamState: StreamingTextBuffers,
): void {
  const event = message.event as
    | {
        type?: string;
        index?: number;
        message?: { id?: string };
        content_block?: { type?: string };
        delta?: { type?: string; text?: string; thinking?: string };
      }
    | undefined;
  if (!event || typeof event.type !== 'string') return;
  const parentToolUseId =
    typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null;

  switch (event.type) {
    case 'message_start': {
      const id = event.message?.id;
      if (typeof id === 'string') streamState.handleMessageStart(id, parentToolUseId);
      return;
    }
    case 'content_block_start': {
      const blockType = event.content_block?.type;
      if (typeof event.index === 'number' && typeof blockType === 'string') {
        streamState.handleBlockStart(parentToolUseId, event.index, blockType);
      }
      return;
    }
    case 'content_block_delta': {
      if (typeof event.index !== 'number' || !event.delta) return;
      streamState.handleDelta(parentToolUseId, event.index, event.delta);
      return;
    }
    default:
      return;
  }
}

async function announceSupportedAgents(
  sdkQuery: Awaited<ReturnType<typeof createChatQuery>>['query'],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  try {
    const agents = await sdkQuery.supportedAgents();
    if (agents.length === 0) return;
    onEvent({
      type: 'status_message',
      text: `本次研究可按需调用 ${agents.length} 个子代理`,
    });
  } catch {
    // ignore
  }
}

async function ensurePluginsReady(
  sdkQuery: Awaited<ReturnType<typeof createChatQuery>>['query'],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  try {
    const refreshed = await sdkQuery.reloadPlugins();
    if (refreshed.error_count > 0) {
      console.warn('[run-chat] plugin reload reported errors:', refreshed);
      onEvent({
        type: 'status_message',
        text: `技能插件加载出现 ${refreshed.error_count} 个错误，请检查设置或插件目录`,
      });
    }
  } catch (err) {
    console.warn('[run-chat] reloadPlugins failed:', err);
  }
}

async function maybeEmitContextPressure(
  sdkQuery: Awaited<ReturnType<typeof createChatQuery>>['query'],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  try {
    const usage = await sdkQuery.getContextUsage();
    onEvent({
      type: 'context_usage',
      total_tokens: usage.totalTokens,
      max_tokens: usage.maxTokens,
      raw_max_tokens: usage.rawMaxTokens,
      percentage: usage.percentage,
      model: usage.model,
      categories: usage.categories.map((category) => ({
        name: category.name,
        tokens: category.tokens,
        color: category.color,
        isDeferred: category.isDeferred,
      })),
    });
    if (usage.percentage >= 85) {
      onEvent({
        type: 'status_message',
        text: `上下文窗口已使用 ${usage.percentage.toFixed(0)}%，即将自动压缩`,
      });
    }
  } catch {
    // ignore
  }
}

function buildSessionLog(
  sessionId: string,
  startedAt: number,
  firstMessage: string,
  provider: ResolvedProvider,
  stats: SessionStats,
  finishReason: 'user_cancel' | 'user_interrupt' | 'agent_done' | 'error',
  workspaceRoot?: string,
): SessionLogEntry {
  return {
    sessionId,
    sdkSessionId: stats.sdkSessionId,
    workspaceRoot,
    finishReason,
    startedAt,
    endedAt: Date.now(),
    firstPrompt: truncate(firstMessage, 120),
    providerSource: provider.source,
    providerId: provider.providerId,
    providerLabel: provider.providerLabel,
    model: provider.model,
    baseURL: provider.baseURL,
    userMessageCount: stats.userMessageCount,
    agentTurnCount: stats.agentTurnCount,
    totalDurationMs: stats.totalDurationMs,
    totalCostUsd: stats.totalCostUsd,
    totalTokens: stats.totalTokens,
    ok: stats.ok,
    errorMessage: stats.lastError,
  };
}

async function safeAppendLog(entry: SessionLogEntry): Promise<void> {
  try {
    await appendSessionLog(entry);
  } catch (err) {
    console.warn('[run-chat] appendSessionLog failed:', err);
  }
}

async function safeAppendRuntimeErrorLog(
  entry: ReturnType<typeof buildRuntimeErrorLogEntry>,
): Promise<string | null> {
  try {
    return await appendRuntimeErrorLog(entry);
  } catch (err) {
    console.warn('[run-chat] appendRuntimeErrorLog failed:', err);
    return null;
  }
}

function formatRuntimeErrorMessage(
  prefix: string,
  error: unknown,
  errorLogPath?: string | null,
): string {
  const described = describeError(error);
  const resolvedLogPath = errorLogPath ?? getRuntimeErrorLogPath();
  return `${prefix}：${described.message}\n详细日志：${resolvedLogPath}`;
}

function joinStderr(chunks: string[]): string | undefined {
  if (chunks.length === 0) return undefined;
  const merged = chunks.join('');
  if (merged.length <= 16_000) return merged;
  return merged.slice(-16_000);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function makeDeadHandle(): ChatSessionHandle {
  const stats: SessionStats = {
    userMessageCount: 0,
    agentTurnCount: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalTokens: 0,
    ok: false,
    lastError: 'session never started',
  };
  return {
    sendUserMessage: () => {},
    cancel: () => {},
    getStats: () => ({ ...stats }),
    done: Promise.resolve(),
  };
}
