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
  /**
   * Resume 续跑时由 main 进程注入的"历史总耗"基线。stats 的各累计字段
   * 会以它作为起点累加，所以日志的 totalCostUsd / totalTokens 等字段代表
   * "自会话首次开启至今"的累计值，而不是"单次续跑的累计值"。
   */
  priorStats?: Partial<SessionStats>;
  /**
   * Resume 续跑时的原始 startedAt。不传就用 Date.now()。传了就保留首次启动
   * 的时间戳，这样侧边栏里这条会话显示的时间稳定对应首次研究开始。
   */
  originalStartedAt?: number;
  /**
   * Resume 续跑时透传给终态日志的 firstPrompt，避免"续跑的那句指导"覆盖
   * 掉侧边栏首次展示的研究主题。不传就用本次的 firstMessage。
   */
  persistedFirstPrompt?: string;
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
  /** 归一化后的 input token 累计。非 Anthropic 官方 provider 不信任 cache 字段，见 normalizeUsage。 */
  totalInputTokens: number;
  /** 输出 token 累计。 */
  totalOutputTokens: number;
  /** 缓存 token 累计（cache_creation + cache_read）。非官方 provider 取 0。 */
  totalCacheTokens: number;
  /**
   * 本轮 in-progress turn 的 I/O 累计。每条 assistant message 的 usage 累加进来，
   * result 消息到达时清零。**不参与跨 turn / 跨 session 的任何累计**——仅用于让 UI
   * 在长 turn（十几分钟没出 result）期间也能看到实时消耗，否则 Input/Output 会一直显示 —。
   */
  liveTurnInputTokens: number;
  liveTurnOutputTokens: number;
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
    priorStats,
    originalStartedAt,
    persistedFirstPrompt,
  } = params;
  const startedAt = originalStartedAt ?? Date.now();
  const firstPromptForLog = persistedFirstPrompt ?? firstMessage;

  onEvent({ type: 'session_started', firstPrompt: firstMessage });

  // 记录最近一次推入队列的 prompt，失败重试时用它重发给 SDK。放在闭包里而不是
  // 直接从 queue 里反查，因为 PromptQueue 不保留已消费消息。
  const retryState: { attempts: number; lastPrompt: string | null } = {
    attempts: 0,
    lastPrompt: null,
  };
  const pushToQueue = (text: string, remember = true): void => {
    if (remember) retryState.lastPrompt = text;
    queue.push(text);
  };

  pushToQueue(runtimeMessage ?? firstMessage);
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
      firstPrompt: truncate(firstPromptForLog, 120),
      providerSource: 'env',
      model: '(unresolved)',
      userMessageCount: priorStats?.userMessageCount ?? 1,
      agentTurnCount: priorStats?.agentTurnCount ?? 0,
      totalDurationMs: priorStats?.totalDurationMs ?? 0,
      totalCostUsd: priorStats?.totalCostUsd ?? 0,
      totalTokens: priorStats?.totalTokens ?? 0,
      totalInputTokens: priorStats?.totalInputTokens ?? 0,
      totalOutputTokens: priorStats?.totalOutputTokens ?? 0,
      totalCacheTokens: priorStats?.totalCacheTokens ?? 0,
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

  // 累计字段以 priorStats 为基线：resume 时 stats 里永远是"自首次启动至今"的
  // 终值。userMessageCount 额外 +1，因为刚刚 push 了本次 runtimeMessage。
  const stats: SessionStats = {
    sdkSessionId: resumeSessionId,
    userMessageCount: (priorStats?.userMessageCount ?? 0) + 1,
    agentTurnCount: priorStats?.agentTurnCount ?? 0,
    totalCostUsd: priorStats?.totalCostUsd ?? 0,
    totalDurationMs: priorStats?.totalDurationMs ?? 0,
    totalTokens: priorStats?.totalTokens ?? 0,
    totalInputTokens: priorStats?.totalInputTokens ?? 0,
    totalOutputTokens: priorStats?.totalOutputTokens ?? 0,
    totalCacheTokens: priorStats?.totalCacheTokens ?? 0,
    // per-turn 字段，不从 priorStats 继承——新 session / resume 都从 0 开始累加
    liveTurnInputTokens: 0,
    liveTurnOutputTokens: 0,
    ok: true,
  };

  let finalizeReason: 'user_cancel' | 'user_interrupt' | 'agent_done' | 'error' = 'agent_done';
  let lastContextEmitAt = 0;
  const streamState = new StreamingTextBuffers(onEvent);

  const mainLoop = (async () => {
    try {
      for await (const message of sdkQuery) {
        trackSdkSession(message, stats, onEvent);

        if (message.type === 'result') {
          // 把 result 消息从通用 translate 路径拆出来：先 accumulate 统计，再
          // 根据 ok/fail 决定"emit turn_result + 清零 retry"还是"触发指数退避重试"。
          const verdict = accumulateResult(message, stats, provider);
          if (verdict.ok) {
            retryState.attempts = 0;
            onEvent(verdict.event);
          } else {
            const handled = await handleApiFailure({
              verdict,
              provider,
              retryState,
              stderrChunks,
              abortSignal: internalAbort.signal,
              onEvent,
              pushToQueue,
            });
            if (handled === 'terminal') {
              stats.ok = false;
              stats.lastError = verdict.failureMessage;
              finalizeReason = 'error';
              // Terminal 情况下仍要对外发 turn_result ok=false，保留"回合失败"分隔符
              // 的既有 UX，并让 sessions-store 维持原来的 flushPersist 语义。
              onEvent(verdict.event);
              break;
            }
            if (handled === 'aborted') {
              // sleep 期间用户取消：保留用户意图、由 cancel 路径负责 finalize。
              break;
            }
            // 'retried' 继续 for-await 等 SDK 下一轮
          }
        } else {
          translate(message, stats, provider, onEvent, streamState);
        }

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
      // SDK 迭代器抛异常通常是子进程死 / 网络流中断，属于不可恢复的 stream_error。
      // 为了和 api_error 保持一致的前端 UX，这里也发一条 llm_call_failed (terminal)
      // 把 provider / model / stderr 尾巴带给 UI，便于排查；用户仍能看到红色 error 卡片。
      const described = describeError(err);
      onEvent({
        type: 'llm_call_failed',
        phase: 'stream_error',
        providerLabel: provider.providerLabel,
        model: provider.model,
        errorMessage: described.message,
        stderrTail: tailStderrForEvent(stderrChunks),
        willRetry: false,
      });
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
          firstPromptForLog,
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
      pushToQueue(runtimeText ?? text);
      // 用户手动发消息意味着上一个失败已被用户接管——清零 retry 计数，让下一次
      // 重试从头开始。
      retryState.attempts = 0;
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

/**
 * 跟踪 SDK 的 session_id。Claude Agent SDK 在以下场景会换发新的 session_id：
 *   - 首次 query 启动时分配初始 id
 *   - resume 时会以旧 session 为 seed 生成新 id 继续写
 *   - auto-compact 跑完后换 id 写压缩后的后续消息
 *
 * 早期实现是"只绑第一次"(bindSdkSessionOnce)，结果长 turn 跨 auto-compact 后，
 * 磁盘日志里存的还是旧 id —— 下次用户点"继续"去 resume 就会命中 SDK 的
 * "No conversation found with session ID: ..." 错误。这里改成每次 id 变化都
 * 同步到 stats、并 emit 事件让前端 / 日志落盘层更新。
 */
function trackSdkSession(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
): void {
  if (typeof message.session_id !== 'string' || !message.session_id) return;
  if (stats.sdkSessionId === message.session_id) return;
  stats.sdkSessionId = message.session_id;
  onEvent({ type: 'sdk_session_bound', sdkSessionId: message.session_id });
}

function translate(
  message: SDKMessageLike,
  stats: SessionStats,
  provider: ResolvedProvider,
  onEvent: (event: ChatEvent) => void,
  streamState: StreamingTextBuffers,
): void {
  switch (message.type) {
    case 'assistant':
      handleAssistant(message, stats, provider, onEvent, streamState);
      return;
    case 'user':
      handleUserToolResult(message, onEvent);
      return;
    case 'result':
      // result 消息由 mainLoop 直接处理（retry 判定需要），不走 translate。
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
  stats: SessionStats,
  provider: ResolvedProvider,
  onEvent: (event: ChatEvent) => void,
  streamState: StreamingTextBuffers,
): void {
  const inner = message.message as
    | { id?: string; content?: AssistantBlock[]; usage?: UsageLike }
    | undefined;
  const blocks = inner?.content;
  const messageId = typeof inner?.id === 'string' ? inner.id : undefined;
  const parentToolUseId =
    typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : null;

  // Finalize any streaming buffer for this message (the assistant message
  // carries authoritative text; we replace the streaming fragment with it).
  if (messageId) streamState.finalize(messageId);

  // 每条 assistant message 的 usage 表示"这次 LLM call 的消耗"——累加到 per-turn
  // live 计数上，发 turn_partial_usage 让 UI 实时滴答。result 到达时由 accumulateResult
  // 清零累加器，同时前端用 turn_result 的权威值覆盖，不会重复计入总数。
  // 不发 assistant 消息 usage 的 provider（部分国产兼容实现）自然退化为不滴答，
  // 不会比现状更差。
  if (inner?.usage && typeof inner.usage === 'object') {
    const normalized = normalizeUsage(provider.providerId, inner.usage);
    if (normalized.inputTokens > 0 || normalized.outputTokens > 0) {
      stats.liveTurnInputTokens += normalized.inputTokens;
      stats.liveTurnOutputTokens += normalized.outputTokens;
      onEvent({
        type: 'turn_partial_usage',
        input_tokens: stats.liveTurnInputTokens,
        output_tokens: stats.liveTurnOutputTokens,
        cache_creation_input_tokens: normalized.cacheCreationInputTokens || undefined,
        cache_read_input_tokens: normalized.cacheReadInputTokens || undefined,
      });
    }
  }

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

interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** 已归一化的总 token 数；若四项全为 0 则为 undefined。 */
  totalTokens: number | undefined;
}

/**
 * 归一化 SDK 返回的 usage。
 *
 * Anthropic 官方 API 的语义：input_tokens 不含 cache，四项相加 = 真实总量。
 * 国产 Anthropic 兼容 provider（MiniMax / DeepSeek / Kimi / GLM 等）实现不统
 * 一，**常把 cache tokens 同时计入 input_tokens 和 cache_*_input_tokens**，
 * 导致累加时翻倍。这里对非官方 provider 一律忽略 cache 字段，只用 input+output。
 * 代价是个别正确汇报 cache 的国产 provider 的 cache 命中不会被计入，但宁可
 * 低估不翻倍。
 */
function normalizeUsage(providerId: string | undefined, usage: UsageLike): NormalizedUsage {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const isAnthropicOfficial = providerId === 'anthropic';

  if (isAnthropicOfficial) {
    const total = input + output + cacheCreation + cacheRead;
    return {
      inputTokens: input,
      outputTokens: output,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
      totalTokens: total > 0 ? total : undefined,
    };
  }

  const total = input + output;
  return {
    inputTokens: input,
    outputTokens: output,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: total > 0 ? total : undefined,
  };
}

type TurnResultEvent = Extract<ChatEvent, { type: 'turn_result' }>;

interface ResultVerdict {
  ok: boolean;
  subtype?: string;
  errors: string[];
  failureMessage: string;
  /** 已构造好的 turn_result 事件。success 时直接 emit；failure 时只在 terminal 分支 emit。 */
  event: TurnResultEvent;
}

/**
 * 吸收 SDK result 消息的 cost / duration / tokens 统计，并返回成败 verdict。
 *
 * 原 `handleResult` 会在失败时直接 emit turn_result ok=false，但这让重试逻辑无处
 * 插入——前端已经看到"回合失败"分隔符了，之后再发重试事件会造成顺序混乱。
 * 现在拆成 accumulate（纯统计 + 构造事件）+ 由 mainLoop 决定何时 emit 的两段式。
 */
function accumulateResult(
  message: SDKMessageLike,
  stats: SessionStats,
  provider: ResolvedProvider,
): ResultVerdict {
  const subtype = message.subtype as string | undefined;
  const costUsd = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined;
  const durationMs = typeof message.duration_ms === 'number' ? message.duration_ms : undefined;
  const numTurns = typeof message.num_turns === 'number' ? message.num_turns : undefined;
  const rawUsage = (message.usage ?? {}) as UsageLike;
  const normalized = normalizeUsage(provider.providerId, rawUsage);
  const {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens,
  } = normalized;
  const cacheTokens = cacheCreationInputTokens + cacheReadInputTokens;

  if (typeof costUsd === 'number') stats.totalCostUsd += costUsd;
  if (typeof durationMs === 'number') stats.totalDurationMs += durationMs;
  if (typeof numTurns === 'number') stats.agentTurnCount += numTurns;
  if (typeof totalTokens === 'number') stats.totalTokens += totalTokens;
  stats.totalInputTokens += inputTokens;
  stats.totalOutputTokens += outputTokens;
  stats.totalCacheTokens += cacheTokens;
  // 新 turn 即将开始（或刚失败退出），把 per-turn 累加器清零。前端收到 turn_result
  // 会把 liveTurnUsage 置 null，双方保持一致。
  stats.liveTurnInputTokens = 0;
  stats.liveTurnOutputTokens = 0;

  if (subtype === 'success') {
    return {
      ok: true,
      errors: [],
      failureMessage: '',
      event: {
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
      },
    };
  }

  const errors = Array.isArray(message.errors) ? (message.errors as string[]) : [];
  const failureMessage = errors.join('; ') || subtype || 'unknown';
  return {
    ok: false,
    subtype,
    errors,
    failureMessage,
    event: {
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
    },
  };
}

// ---------- Retry with exponential backoff ----------------------------------
//
// Provider API 有时会偶发 429 / 5xx / 网络抖动。失败一次就 finalize 整个会话
// 对自动研究模式太苛刻——agent 跑了十几分钟因为上游 1 次 5xx 就全没了。
// 这里的策略：api_error（result 带 subtype != success）时做指数退避重试，
// 延迟 2s → 4s → ... cap 60s，最多 10 次；每次重试就把上次 prompt 重新推给
// SDK 让它继续（SDK 侧会走 resume 语义，上下文不丢）。
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_BASE_MS = 2000;
const RETRY_CAP_MS = 60_000;

function computeBackoffMs(attempt: number): number {
  const raw = RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(raw, RETRY_CAP_MS);
  // ±10% jitter，避免多会话同时重试造成 provider 二次打压。
  const jitter = capped * (0.9 + Math.random() * 0.2);
  return Math.round(jitter);
}

function isRetryableFailure(subtype: string | undefined, errorMessage: string): boolean {
  // error_max_turns 是 agent 自己跑到 maxTurns 上限——重跑仍会撞同一面墙，没意义。
  if (subtype === 'error_max_turns') return false;
  const lower = errorMessage.toLowerCase();
  // 鉴权类错误重试 10 次也不会好，反而会让 provider 把 key 标记异常。
  if (/\b40[13]\b|unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication/i.test(lower)) {
    return false;
  }
  return true;
}

function tailStderrForEvent(chunks: string[]): string | undefined {
  const merged = joinStderr(chunks);
  if (!merged) return undefined;
  // 前端展开卡片里看的是最新几行，限到 2KB 够定位，不占 IPC 带宽。
  return merged.length > 2000 ? merged.slice(-2000) : merged;
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new AbortError();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

type FailureOutcome = 'retried' | 'terminal' | 'aborted';

interface HandleApiFailureArgs {
  verdict: ResultVerdict;
  provider: ResolvedProvider;
  retryState: { attempts: number; lastPrompt: string | null };
  stderrChunks: string[];
  abortSignal: AbortSignal;
  onEvent: (event: ChatEvent) => void;
  pushToQueue: (text: string, remember?: boolean) => void;
}

/**
 * Entry B 失败的重试决策点。判断是否可重试、是否还有额度；可以就 emit 提示事件、
 * 等退避、把上次 prompt 重推给 SDK 让它开下一轮；否则告诉 mainLoop 按 terminal 走。
 */
async function handleApiFailure(args: HandleApiFailureArgs): Promise<FailureOutcome> {
  const {
    verdict,
    provider,
    retryState,
    stderrChunks,
    abortSignal,
    onEvent,
    pushToQueue,
  } = args;

  const retryable = isRetryableFailure(verdict.subtype, verdict.failureMessage);
  const hasBudget = retryState.attempts < MAX_RETRY_ATTEMPTS;
  const canReplay = retryState.lastPrompt != null;

  if (!retryable || !hasBudget || !canReplay) {
    onEvent({
      type: 'llm_call_failed',
      phase: 'api_error',
      providerLabel: provider.providerLabel,
      model: provider.model,
      subtype: verdict.subtype,
      errorMessage: verdict.failureMessage,
      stderrTail: tailStderrForEvent(stderrChunks),
      willRetry: false,
    });
    return 'terminal';
  }

  retryState.attempts += 1;
  const delayMs = computeBackoffMs(retryState.attempts);
  onEvent({
    type: 'llm_call_failed',
    phase: 'api_error',
    providerLabel: provider.providerLabel,
    model: provider.model,
    subtype: verdict.subtype,
    errorMessage: verdict.failureMessage,
    stderrTail: tailStderrForEvent(stderrChunks),
    willRetry: true,
  });
  onEvent({
    type: 'retry_attempt',
    attempt: retryState.attempts,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    nextDelayMs: delayMs,
    reason: verdict.failureMessage.slice(0, 200),
  });

  try {
    await sleepWithAbort(delayMs, abortSignal);
  } catch {
    return 'aborted';
  }

  // 重推 lastPrompt 让 SDK 开启下一轮。remember=false 因为它只是 replay，
  // 不改变 retryState.lastPrompt（避免 sendUserMessage 语义被干扰）。
  pushToQueue(retryState.lastPrompt!, false);
  return 'retried';
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
    totalInputTokens: stats.totalInputTokens,
    totalOutputTokens: stats.totalOutputTokens,
    totalCacheTokens: stats.totalCacheTokens,
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
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheTokens: 0,
    liveTurnInputTokens: 0,
    liveTurnOutputTokens: 0,
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
