// 顶部活动栏：实时反映 agent 当前在做什么（调哪个工具 / 跑哪个子代理 / 思考中），
// 同时保留本会话的 token & 运行时长简要指标。取代早期的 Idea/Execute/Writer/Reviewer
// 阶段栏——那个粒度太粗，静默时间过长，看不出 agent 活着还是卡了。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { useChat } from '../features/chat/ChatContext';
import type { LiveTurnUsage } from '../features/chat/sessions-store';
import type { TranscriptEntry } from '../features/chat/TranscriptMessage';

export default function StageRail({ variant = 'page' }: { variant?: 'page' | 'hero' }) {
  const { t } = useTranslation('chat');
  const { transcript, chatState, runStatus, liveTurnUsage } = useChat();
  const metrics = summarizeTranscript(transcript, chatState === 'running', liveTurnUsage);

  // 让 tool/subagent 的"已跑 Xs"能随时间自然滴答，不必等新事件才刷新。
  const [, force] = useState(0);
  useEffect(() => {
    if (chatState !== 'running') return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [chatState]);

  const activity = summarizeLiveActivity(transcript, chatState, runStatus, t);

  const rail = (
    <div
      className={[
        'flex items-center',
        variant === 'page'
          ? 'mx-auto w-full max-w-[980px] gap-6'
          : 'w-auto justify-center gap-3',
      ].join(' ')}
    >
      <ActivityPill activity={activity} variant={variant} />

      {variant === 'page' && (
        <div className="ml-auto flex shrink-0 items-center gap-4 text-[11px] font-mono text-fg-muted">
          <span title={t('stage.tokenInputTitle')}>
            {t('stage.tokenInputLabel')} {formatNumber(metrics.inputTokens)}
          </span>
          <span title={t('stage.tokenOutputTitle')}>
            {t('stage.tokenOutputLabel')} {formatNumber(metrics.outputTokens)}
          </span>
          <span>{metrics.durationMs == null ? '—' : formatDuration(metrics.durationMs)}</span>
        </div>
      )}
    </div>
  );

  if (variant === 'hero') {
    return <div className="flex w-full justify-center">{rail}</div>;
  }

  return <div className="flex h-[58px] items-center border-b border-border px-6">{rail}</div>;
}

// ---------- Live Activity ----------------------------------------------------

type LiveActivityState = 'idle' | 'working' | 'waiting' | 'done' | 'error';

interface LiveActivity {
  state: LiveActivityState;
  label: string;
  detail?: string;
}

function ActivityPill({
  activity,
  variant,
}: {
  activity: LiveActivity;
  variant: 'page' | 'hero';
}) {
  const textClass =
    activity.state === 'idle'
      ? variant === 'hero'
        ? 'text-fg-muted'
        : 'text-fg-subtle'
      : 'text-fg';

  // working 状态换掉小圆点，给一个明确的 spinner 环——老板一眼就能看出"在转"，
  // 不用盯着 2px 的 pulse 猜是不是卡了。非 working 状态保留彩色圆点，承担语义信号
  // （warning/danger/success/idle）。
  const indicator =
    activity.state === 'working' ? (
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent"
      />
    ) : (
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          activity.state === 'waiting'
            ? 'bg-warning'
            : activity.state === 'error'
              ? 'bg-danger'
              : activity.state === 'done'
                ? 'bg-success'
                : 'bg-border-strong'
        }`}
      />
    );

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {indicator}
      <span className={`truncate text-[12.5px] leading-5 ${textClass}`}>{activity.label}</span>
      {activity.detail && (
        <span className="shrink-0 text-[11.5px] text-fg-subtle">· {activity.detail}</span>
      )}
    </div>
  );
}

/**
 * 从 transcript 末尾反向扫，挑一条最能说明"agent 当前在干啥"的事件，
 * 组装成一条人类可读的活动描述。优先级：
 *   running tool_use > active subagent > 最新 status_message > 最新 assistant 思考中
 *
 * chatState 为 running 但没有可解释事件时，显示"思考中…"而不是空白——
 * 老板最怕的就是看不到 agent 在做啥。
 */
type ChatStateLite = 'idle' | 'running' | 'waiting';
type RunStatusLite =
  | 'idle'
  | 'running'
  | 'awaiting_user_guidance'
  | 'completed'
  | 'failed'
  | 'cancelled';

function summarizeLiveActivity(
  transcript: TranscriptEntry[],
  chatState: ChatStateLite,
  runStatus: RunStatusLite,
  t: TFunction<'chat'>,
): LiveActivity {
  const now = Date.now();

  let lastAssistantTs: number | null = null;
  let lastAssistantSnippet: string | null = null;
  let lastThinkingTs: number | null = null;
  let lastThinkingSnippet: string | null = null;
  let lastStatus: string | null = null;
  let latestSubagent: {
    phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
    description?: string;
    lastToolName?: string;
    ts: number;
  } | null = null;
  let activeToolUse: {
    name: string;
    input: unknown;
    ts: number;
  } | null = null;
  // 为"空窗期"回退准备：记住最近结束的工具名 + tool_result 时间戳，以及本轮总共调过
  // 几个工具。tool_result 到下一次 LLM 响应之间常有 2~10s 静默，这段时间给用户显示
  // "刚完成 X · 等待下一步…"，比回落到初始横幅精确得多。
  let lastToolResultTs: number | null = null;
  let lastCompletedToolName: string | null = null;
  let toolUseCount = 0;
  // 最近一次 retry_attempt；只要之后没再出现成功的 turn_result 就仍认为是"重试
  // 窗口中"，在顶栏 pill 上明确提示，免得用户以为卡死了。
  let pendingRetry: {
    attempt: number;
    maxAttempts: number;
    nextDelayMs: number;
    reason: string;
    ts: number;
  } | null = null;
  let sawSuccessAfterRetry = false;

  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (!pendingRetry && !sawSuccessAfterRetry) {
      if (entry.kind === 'turn_result' && entry.ok) {
        sawSuccessAfterRetry = true;
      } else if (entry.kind === 'retry_attempt') {
        pendingRetry = {
          attempt: entry.attempt,
          maxAttempts: entry.maxAttempts,
          nextDelayMs: entry.nextDelayMs,
          reason: entry.reason,
          ts: entry.ts,
        };
      }
    }
    if (entry.kind === 'tool_use') {
      toolUseCount += 1;
      if (!activeToolUse && entry.status !== 'done') {
        activeToolUse = { name: entry.name, input: entry.input, ts: entry.ts };
      }
      if (!lastCompletedToolName && entry.status === 'done') {
        lastCompletedToolName = entry.name;
      }
    }
    if (!lastToolResultTs && entry.kind === 'tool_result') {
      lastToolResultTs = entry.ts;
    }
    if (!latestSubagent && entry.kind === 'subagent') {
      latestSubagent = {
        phase: entry.phase,
        description: entry.description,
        lastToolName: entry.lastToolName,
        ts: entry.ts,
      };
    }
    if (!lastStatus && entry.kind === 'status' && !shouldSkipStatusForPill(entry.text, t)) {
      lastStatus = entry.text;
    }
    if (!lastAssistantTs && entry.kind === 'assistant') {
      lastAssistantTs = entry.ts;
      lastAssistantSnippet = entry.text.trim().slice(0, 60);
    }
    if (!lastThinkingTs && entry.kind === 'thinking') {
      lastThinkingTs = entry.ts;
      lastThinkingSnippet = entry.text.trim().slice(0, 60);
    }
    if (
      activeToolUse &&
      latestSubagent &&
      lastStatus &&
      lastAssistantSnippet &&
      lastThinkingSnippet
    ) break;
  }

  // 重试窗口优先级高于绝大多数状态：上游失败了正在等退避，用户最想看到的就是
  // "第几次 / 还要等多久"。用 working 状态（accent 色脉动），不用红色—— 用户
  // 把 error 色留给真正终止的失败。
  if (pendingRetry && !sawSuccessAfterRetry && chatState !== 'idle') {
    const elapsedMs = now - pendingRetry.ts;
    const remainSec = Math.max(0, Math.round((pendingRetry.nextDelayMs - elapsedMs) / 1000));
    const detail =
      remainSec > 0 ? t('stage.retryNextIn', { seconds: remainSec }) : t('stage.retryRetrying');
    return {
      state: 'working',
      label: t('stage.retryLabel', {
        attempt: pendingRetry.attempt,
        maxAttempts: pendingRetry.maxAttempts,
      }),
      detail,
    };
  }

  if (runStatus === 'failed') {
    return { state: 'error', label: t('stage.runFailed') };
  }
  if (runStatus === 'cancelled') {
    return { state: 'idle', label: t('stage.runCancelled') };
  }
  if (runStatus === 'awaiting_user_guidance') {
    return { state: 'waiting', label: t('stage.runAwaitingGuidance') };
  }

  // running tool 最直观：显示工具名 + 参数摘要 + 已跑 Xs
  if (activeToolUse && chatState === 'running') {
    const elapsed = Math.max(0, Math.round((now - activeToolUse.ts) / 1000));
    return {
      state: 'working',
      label: describeToolUse(activeToolUse.name, activeToolUse.input, t),
      detail: elapsed > 0 ? `${elapsed}s` : undefined,
    };
  }

  // 活跃子代理
  if (
    latestSubagent &&
    (latestSubagent.phase === 'started' || latestSubagent.phase === 'progress')
  ) {
    const elapsed = Math.max(0, Math.round((now - latestSubagent.ts) / 1000));
    const desc =
      latestSubagent.description ?? latestSubagent.lastToolName ?? t('stage.subagentDefaultDesc');
    return {
      state: 'working',
      label: t('stage.subagentLabel', { description: truncate(desc, 40) }),
      detail: elapsed > 0 ? `${elapsed}s` : undefined,
    };
  }

  if (chatState === 'running') {
    const toolDetail =
      toolUseCount > 0 ? t('stage.toolDetail', { count: toolUseCount }) : undefined;

    // 最近有 assistant 流式输出（模型正在增量回答，比 thinking 更"出声"）
    if (lastAssistantTs && now - lastAssistantTs < 4000) {
      return {
        state: 'working',
        label: lastAssistantSnippet
          ? t('stage.answeringWithSnippet', { snippet: lastAssistantSnippet })
          : t('stage.answering'),
      };
    }
    // 最近有 thinking 事件（extended thinking 模型会持续吐思考块）。窗口从 8s 放
    // 到 15s——extended thinking 的块间隔常有 10s 以上，原来 8s 太紧。
    if (lastThinkingTs && now - lastThinkingTs < 15000) {
      return {
        state: 'working',
        label: lastThinkingSnippet
          ? t('stage.thinkingWithSnippet', { snippet: lastThinkingSnippet })
          : t('stage.thinking'),
      };
    }
    // tool 刚跑完、下一个 LLM 响应还没到的空窗（最多 12s）——显示"刚完成 X · 等待
    // 下一步…"，让用户知道不是卡死而是在排队。
    if (
      lastToolResultTs &&
      now - lastToolResultTs < 12000 &&
      lastCompletedToolName
    ) {
      return {
        state: 'working',
        label: t('stage.toolFinishedWaiting', { tool: lastCompletedToolName }),
        detail: toolDetail,
      };
    }
    // 仍落到最近一条 status（非一次性横幅）
    if (lastStatus) {
      return { state: 'working', label: truncate(lastStatus, 60), detail: toolDetail };
    }
    // 真正空窗：所有都没命中——大概率是正在等 LLM 生成首个 token。带"已静默 Xs"
    // 倒计时，比呆板的"思考中…"更能安抚用户"它没挂"。
    const lastAnyEventTs = Math.max(
      lastAssistantTs ?? 0,
      lastThinkingTs ?? 0,
      lastToolResultTs ?? 0,
      activeToolUse?.ts ?? 0,
      latestSubagent?.ts ?? 0,
    );
    const silenceSec =
      lastAnyEventTs > 0 ? Math.max(0, Math.round((now - lastAnyEventTs) / 1000)) : 0;
    return {
      state: 'working',
      label: t('stage.waitingResponse'),
      detail:
        silenceSec > 2
          ? toolDetail
            ? t('stage.silenceWithTool', { toolDetail, seconds: silenceSec })
            : t('stage.silenceDetail', { seconds: silenceSec })
          : toolDetail,
    };
  }

  if (chatState === 'waiting') {
    return {
      state: 'waiting',
      label: lastStatus ? truncate(lastStatus, 60) : t('stage.waitingUserInput'),
    };
  }

  if (runStatus === 'completed') {
    return {
      state: 'done',
      label: lastStatus ? truncate(lastStatus, 60) : t('stage.turnDone'),
    };
  }

  return { state: 'idle', label: t('stage.idleHint') };
}

// 启动噪声 / 非"当前在做什么"的 status 要在顶栏里吃掉，否则会被当 fallback 顶几分钟。
// 与 TranscriptMessage.shouldHideStatus 同源，扩了几条已知的一次性公告。
//
// session_started 横幅由 sessions-store 写入，跟当前 i18n 语言走，但用户切语言或
// 历史会话中横幅文字仍可能是另一种语言。这里同时识别中英两种字面量，避免漏过。
const SESSION_STARTED_BANNER_ZH = '研究已启动，自动运行中';
const SESSION_STARTED_BANNER_EN = 'Research started, running automatically';

function shouldSkipStatusForPill(text: string, t: TFunction<'chat'>): boolean {
  const trimmed = text.trim();
  if (/^本次研究可按需调用\s+\d+\s+个子代理$/.test(trimmed)) return true;
  if (/^技能插件加载出现\s+\d+\s+个错误/.test(trimmed)) return true;
  if (/^已从记忆中召回\s+\d+\s+条相关内容$/.test(trimmed)) return true;
  // session_started 的初始横幅一旦有真活动就不该再作为 fallback，否则会在整个会话
  // 里盖住"实际在干啥"。transcript 里仍然保留做分割线。
  if (
    trimmed === SESSION_STARTED_BANNER_ZH ||
    trimmed === SESSION_STARTED_BANNER_EN ||
    trimmed === t('transcript.skipStatus.sessionStartedBanner')
  ) {
    return true;
  }
  return false;
}

function describeToolUse(name: string, rawInput: unknown, t: TFunction<'chat'>): string {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<
    string,
    unknown
  >;
  const pickStr = (key: string): string | undefined => {
    const v = input[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = pickStr('file_path') ?? pickStr('notebook_path');
      return path ? `${name} · ${shortenPath(path)}` : t('stage.tool.calling', { name });
    }
    case 'Bash': {
      const cmd = pickStr('command');
      return cmd ? `Bash · ${truncate(cmd, 48)}` : t('stage.tool.callingBash');
    }
    case 'Grep': {
      const pattern = pickStr('pattern');
      const path = pickStr('path');
      if (pattern && path) return `Grep · ${truncate(pattern, 28)} @ ${shortenPath(path)}`;
      return pattern ? `Grep · ${truncate(pattern, 40)}` : t('stage.tool.callingGrep');
    }
    case 'Glob': {
      const pattern = pickStr('pattern');
      return pattern ? `Glob · ${truncate(pattern, 40)}` : t('stage.tool.callingGlob');
    }
    case 'Agent':
    case 'Task': {
      const sub = pickStr('subagent_type');
      const desc = pickStr('description');
      if (sub && desc)
        return t('stage.tool.subagentLabelDual', { type: sub, desc: truncate(desc, 36) });
      if (sub) return t('stage.tool.subagentLabelType', { type: sub });
      if (desc) return t('stage.tool.subagentLabelDesc', { desc: truncate(desc, 40) });
      return t('stage.tool.schedulingSubagent');
    }
    case 'WebFetch': {
      const url = pickStr('url');
      return url ? `WebFetch · ${truncate(url, 48)}` : t('stage.tool.callingWebFetch');
    }
    case 'WebSearch': {
      const query = pickStr('query');
      return query ? `WebSearch · ${truncate(query, 48)}` : t('stage.tool.callingWebSearch');
    }
    case 'TodoWrite':
      return t('stage.tool.todoUpdate');
    default:
      return t('stage.tool.calling', { name });
  }
}

function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) return truncate(normalized, 42);
  return truncate(`…/${segments.slice(-2).join('/')}`, 42);
}

function truncate(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}…`;
}

// ---------- Token / Duration 统计 -------------------------------------------

function summarizeTranscript(
  transcript: TranscriptEntry[],
  isRunning: boolean,
  liveTurnUsage: LiveTurnUsage | null,
) {
  let inputTokens = 0;
  let outputTokens = 0;
  let durationMs = 0;
  let hasTurnUsage = false;
  let lastTurnResultTs: number | null = null;

  for (const entry of transcript) {
    if (entry.kind !== 'turn_result') continue;
    hasTurnUsage = true;
    inputTokens += entry.inputTokens ?? 0;
    outputTokens += entry.outputTokens ?? 0;
    durationMs += entry.durationMs ?? 0;
    lastTurnResultTs = entry.ts;
  }

  // 叠加当前 in-progress turn 的实时 I/O 累计。orchestrator 会在每条 assistant
  // 消息 usage 到来时重发 turn_partial_usage 刷这个值；turn_result 到达时 reducer
  // 清为 null，权威值由上面的循环负责累加，互不重叠。
  //
  // input / output 独立判定：部分非官方 Anthropic 兼容 provider 只在每条 assistant
  // message 上汇报 input_tokens，output_tokens 要等 turn 结束的 result 消息才到。
  // 此时要让 Input 随 live 滴答，Output 保持 "—" 直到 turn_result，而不是一直
  // 显示"Output 0"造成"没在生成"的错觉。
  let hasInputLive = false;
  let hasOutputLive = false;
  if (liveTurnUsage) {
    if (liveTurnUsage.inputTokens > 0) {
      inputTokens += liveTurnUsage.inputTokens;
      hasInputLive = true;
    }
    if (liveTurnUsage.outputTokens > 0) {
      outputTokens += liveTurnUsage.outputTokens;
      hasOutputLive = true;
    }
  }

  // 当前轮还在跑的时候，把"上一次 turn_result 到现在"的时间补进去，让数字随运行滴答。
  // 找不到上一次 turn_result 就退回到第一条 transcript 的时间戳——总比停在 0 好。
  if (isRunning) {
    const anchor = lastTurnResultTs ?? transcript[0]?.ts;
    if (anchor != null) durationMs += Math.max(Date.now() - anchor, 0);
  }

  const hasLive = hasInputLive || hasOutputLive;
  return {
    inputTokens: hasTurnUsage || hasInputLive ? inputTokens : null,
    outputTokens: hasTurnUsage || hasOutputLive ? outputTokens : null,
    durationMs: hasTurnUsage || hasLive || isRunning ? durationMs : null,
  };
}

function formatNumber(value: number | null) {
  if (value == null) return '—';
  if (value >= 1_000_000) {
    const compact = value / 1_000_000;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }
  return `${value}`;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}h ${restMinutes}m`;
}
