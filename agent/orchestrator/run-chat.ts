// Chat 会话编排器。
//
// 把 SDK 的 query 消息流翻译成 Coase 的 ChatEvent，维护会话级指标
// （累计 turn 数 / 累计成本 / 累计时长），会话结束时写一条 SessionLogEntry。
//
// 注意：SDK 的 'result' 事件在多轮模式下每个 agent turn 会发一次，不是"会话结束"。
// 我们把它翻译成 'turn_result'，然后在 cancel / 队列耗尽时再发 'session_finished'。

import { appendSessionLog } from '../logging/session-log';
import { createChatQuery } from '../sdk/client';
import { PromptQueue } from '../chat/prompt-queue';
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
  queue: PromptQueue;
  onEvent: (event: ChatEvent) => void;
  signal?: AbortSignal;
}

export interface ChatSessionHandle {
  /** 把一条新用户消息推进 queue，并把 'user_message_accepted' 事件 push 回 UI。 */
  sendUserMessage(text: string): void;
  /** 主动关闭：end queue + abort，触发 finalize。 */
  cancel(reason: 'user_cancel' | 'error'): void;
  /** 返回 main 进程持有的累计统计，便于 IPC 查询。 */
  getStats(): SessionStats;
  /** 等待主循环自然结束（给调用方 await）。 */
  done: Promise<void>;
}

export interface SessionStats {
  userMessageCount: number;
  agentTurnCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
  ok: boolean;
  lastError?: string;
}

/**
 * 启动一次 chat 会话。返回一个 handle，外部用它 send / cancel。
 *
 * 注意这个函数本身不 await 主循环——它只负责组装、启动、返回 handle，
 * 主循环作为后台 Promise 运行，状态通过 onEvent 回调推出去。
 */
export async function startChatSession(
  params: RunChatSessionParams,
): Promise<ChatSessionHandle> {
  const { sessionId, firstMessage, queue, onEvent, signal } = params;
  const startedAt = Date.now();

  onEvent({ type: 'session_started', firstPrompt: firstMessage });

  // 首条消息先 push 进队列，这样 SDK 一拉就有东西。
  // 必须在 createChatQuery 返回之前 push，因为 SDK 可能在 createChatQuery
  // 内部就开始消费 iterator。
  queue.push(firstMessage);
  onEvent({ type: 'user_message_accepted', text: firstMessage });

  // 外部的 signal 接管 abortController：我们自己这层再包一层，便于 cancel 时统一处理。
  const internalAbort = new AbortController();
  if (signal) {
    if (signal.aborted) internalAbort.abort();
    else signal.addEventListener('abort', () => internalAbort.abort(), { once: true });
  }

  // 初始化 SDK query。失败的话写一条 ok:false 的 session log 并立即返回 handle。
  let bundle: Awaited<ReturnType<typeof createChatQuery>>;
  try {
    bundle = await createChatQuery({ queue, signal: internalAbort.signal });
  } catch (err) {
    const message =
      err instanceof NoProviderConfiguredError || err instanceof UnsupportedProtocolError
        ? err.message
        : `初始化 chat 失败：${err instanceof Error ? err.message : String(err)}`;
    onEvent({ type: 'error', message });
    onEvent({ type: 'session_finished', reason: 'error' });
    await safeAppendLog({
      sessionId,
      startedAt,
      endedAt: Date.now(),
      firstPrompt: truncate(firstMessage, 120),
      providerSource: 'env',
      model: '(unresolved)',
      userMessageCount: 1,
      agentTurnCount: 0,
      totalDurationMs: 0,
      totalCostUsd: 0,
      ok: false,
      errorMessage: message,
    });
    // 返回一个"已关闭"的 handle，调用方 send/cancel 是 no-op。
    return makeDeadHandle();
  }

  const { query: sdkQuery, provider } = bundle;

  onEvent({
    type: 'provider',
    source: provider.source,
    providerId: provider.providerId,
    providerLabel: provider.providerLabel,
    model: provider.model,
    baseURL: provider.baseURL,
  });

  const stats: SessionStats = {
    userMessageCount: 1, // firstMessage 已入
    agentTurnCount: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    ok: true,
  };

  let finalizeReason: 'user_cancel' | 'agent_done' | 'error' = 'agent_done';
  let runtimeError: string | null = null;

  const mainLoop = (async () => {
    try {
      for await (const message of sdkQuery) {
        translate(message, stats, onEvent);
      }
    } catch (err) {
      runtimeError = `运行期错误：${err instanceof Error ? err.message : String(err)}`;
      stats.ok = false;
      stats.lastError = runtimeError;
      finalizeReason = 'error';
      onEvent({ type: 'error', message: runtimeError });
    } finally {
      onEvent({ type: 'session_finished', reason: finalizeReason });
      await safeAppendLog(buildSessionLog(sessionId, startedAt, firstMessage, provider, stats));
    }
  })();

  return {
    sendUserMessage(text: string): void {
      queue.push(text);
      stats.userMessageCount += 1;
      onEvent({ type: 'user_message_accepted', text });
    },
    cancel(reason): void {
      finalizeReason = reason;
      queue.end();
      try {
        sdkQuery.close();
      } catch {
        /* 已关闭的 query 不当回事 */
      }
      internalAbort.abort();
    },
    getStats(): SessionStats {
      return { ...stats };
    },
    done: mainLoop,
  };
}

// ---- 消息翻译 -----------------------------------------------------------

type SDKMessageLike = { type: string; [key: string]: unknown };

function translate(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
): void {
  switch (message.type) {
    case 'assistant':
      handleAssistant(message, onEvent);
      return;
    case 'user':
      handleUserToolResult(message, onEvent);
      return;
    case 'result':
      handleResult(message, stats, onEvent);
      return;
    default:
      // system/partial/hook 等消息在 POC 中忽略
      return;
  }
}

interface AssistantBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

function handleAssistant(
  message: SDKMessageLike,
  onEvent: (event: ChatEvent) => void,
): void {
  const inner = message.message as { content?: AssistantBlock[] } | undefined;
  const blocks = inner?.content;
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      onEvent({ type: 'assistant_text', text: block.text });
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      onEvent({ type: 'tool_use', name: block.name, input: block.input ?? null });
    }
  }
}

interface ToolResultContentBlock {
  type: string;
  text?: string;
}

interface ToolResultBlock {
  type: string;
  content?: string | ToolResultContentBlock[];
  is_error?: boolean;
  tool_use_id?: string;
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
    });
  }
}

function extractToolResultText(content: ToolResultBlock['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
    .join('');
}

function handleResult(
  message: SDKMessageLike,
  stats: SessionStats,
  onEvent: (event: ChatEvent) => void,
): void {
  const subtype = message.subtype as string | undefined;
  const costUsd = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined;
  const durationMs = typeof message.duration_ms === 'number' ? message.duration_ms : undefined;
  const numTurns = typeof message.num_turns === 'number' ? message.num_turns : undefined;

  if (typeof costUsd === 'number') stats.totalCostUsd += costUsd;
  if (typeof durationMs === 'number') stats.totalDurationMs += durationMs;
  if (typeof numTurns === 'number') stats.agentTurnCount += numTurns;

  if (subtype === 'success') {
    onEvent({
      type: 'turn_result',
      ok: true,
      cost_usd: costUsd,
      duration_ms: durationMs,
      num_turns: numTurns,
    });
  } else {
    stats.ok = false;
    const errors = Array.isArray(message.errors) ? (message.errors as string[]) : [];
    stats.lastError = errors.join('; ') || subtype || 'unknown';
    onEvent({
      type: 'turn_result',
      ok: false,
      cost_usd: costUsd,
      duration_ms: durationMs,
      num_turns: numTurns,
      subtype,
      errors,
    });
  }
}

// ---- 日志落盘 -----------------------------------------------------------

function buildSessionLog(
  sessionId: string,
  startedAt: number,
  firstMessage: string,
  provider: ResolvedProvider,
  stats: SessionStats,
): SessionLogEntry {
  return {
    sessionId,
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function makeDeadHandle(): ChatSessionHandle {
  const stats: SessionStats = {
    userMessageCount: 0,
    agentTurnCount: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
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
