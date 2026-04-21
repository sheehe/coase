// 顶部活动栏：实时反映 agent 当前在做什么（调哪个工具 / 跑哪个子代理 / 思考中），
// 同时保留本会话的 token & 运行时长简要指标。取代早期的 Idea/Execute/Writer/Reviewer
// 阶段栏——那个粒度太粗，静默时间过长，看不出 agent 活着还是卡了。
import { useEffect, useState } from 'react';

import { useChat } from '../features/chat/ChatContext';
import type { TranscriptEntry } from '../features/chat/TranscriptMessage';

export default function StageRail({ variant = 'page' }: { variant?: 'page' | 'hero' }) {
  const { transcript, chatState, runStatus } = useChat();
  const metrics = summarizeTranscript(transcript, chatState === 'running');

  // 让 tool/subagent 的"已跑 Xs"能随时间自然滴答，不必等新事件才刷新。
  const [, force] = useState(0);
  useEffect(() => {
    if (chatState !== 'running') return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [chatState]);

  const activity = summarizeLiveActivity(transcript, chatState, runStatus);

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
          <span>Input {formatNumber(metrics.inputTokens)}</span>
          <span>Output {formatNumber(metrics.outputTokens)}</span>
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
  const dotClass =
    activity.state === 'working'
      ? 'bg-accent animate-pulse'
      : activity.state === 'waiting'
        ? 'bg-warning'
        : activity.state === 'error'
          ? 'bg-danger'
          : activity.state === 'done'
            ? 'bg-success'
            : 'bg-border-strong';

  const textClass =
    activity.state === 'idle'
      ? variant === 'hero'
        ? 'text-fg-muted'
        : 'text-fg-subtle'
      : 'text-fg';

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
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
): LiveActivity {
  const now = Date.now();

  let lastAssistantTs: number | null = null;
  let lastAssistantSnippet: string | null = null;
  let lastStatus: string | null = null;
  let latestSubagent: {
    phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
    description?: string;
    lastToolName?: string;
    ts: number;
  } | null = null;
  let activeToolUse: { name: string; ts: number } | null = null;

  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (!activeToolUse && entry.kind === 'tool_use' && entry.status !== 'done') {
      activeToolUse = { name: entry.name, ts: entry.ts };
    }
    if (!latestSubagent && entry.kind === 'subagent') {
      latestSubagent = {
        phase: entry.phase,
        description: entry.description,
        lastToolName: entry.lastToolName,
        ts: entry.ts,
      };
    }
    if (!lastStatus && entry.kind === 'status') {
      lastStatus = entry.text;
    }
    if (!lastAssistantTs && entry.kind === 'assistant') {
      lastAssistantTs = entry.ts;
      lastAssistantSnippet = entry.text.trim().slice(0, 60);
    }
    if (activeToolUse && latestSubagent && lastStatus && lastAssistantSnippet) break;
  }

  if (runStatus === 'failed') {
    return { state: 'error', label: '运行出错' };
  }
  if (runStatus === 'cancelled') {
    return { state: 'idle', label: '已取消' };
  }
  if (runStatus === 'awaiting_user_guidance') {
    return { state: 'waiting', label: '已暂停，等待你的纠偏建议' };
  }

  // running tool 最直观：显示工具名 + 已跑 Xs
  if (activeToolUse && chatState === 'running') {
    const elapsed = Math.max(0, Math.round((now - activeToolUse.ts) / 1000));
    return {
      state: 'working',
      label: `正在调用 ${activeToolUse.name}`,
      detail: elapsed > 0 ? `${elapsed}s` : undefined,
    };
  }

  // 活跃子代理
  if (
    latestSubagent &&
    (latestSubagent.phase === 'started' || latestSubagent.phase === 'progress')
  ) {
    const elapsed = Math.max(0, Math.round((now - latestSubagent.ts) / 1000));
    const desc = latestSubagent.description ?? latestSubagent.lastToolName ?? '子代理工作中';
    return {
      state: 'working',
      label: `子代理 · ${truncate(desc, 40)}`,
      detail: elapsed > 0 ? `${elapsed}s` : undefined,
    };
  }

  if (chatState === 'running') {
    // 最近有 assistant 输出（意味着模型正在增量回答）
    if (lastAssistantTs && now - lastAssistantTs < 4000) {
      return {
        state: 'working',
        label: lastAssistantSnippet
          ? `正在回答：${lastAssistantSnippet}…`
          : '正在回答…',
      };
    }
    if (lastStatus) {
      return { state: 'working', label: truncate(lastStatus, 60) };
    }
    return { state: 'working', label: '思考中…' };
  }

  if (chatState === 'waiting') {
    return {
      state: 'waiting',
      label: lastStatus ? truncate(lastStatus, 60) : '等待用户输入',
    };
  }

  if (runStatus === 'completed') {
    return {
      state: 'done',
      label: lastStatus ? truncate(lastStatus, 60) : '本轮已完成',
    };
  }

  return { state: 'idle', label: '空闲中 · 随时开始新研究' };
}

function truncate(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}…`;
}

// ---------- Token / Duration 统计 -------------------------------------------

function summarizeTranscript(transcript: TranscriptEntry[], isRunning: boolean) {
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

  // 当前轮还在跑的时候，把"上一次 turn_result 到现在"的时间补进去，让数字随运行滴答。
  // 找不到上一次 turn_result 就退回到第一条 transcript 的时间戳——总比停在 0 好。
  if (isRunning) {
    const anchor = lastTurnResultTs ?? transcript[0]?.ts;
    if (anchor != null) durationMs += Math.max(Date.now() - anchor, 0);
  }

  return {
    inputTokens: hasTurnUsage ? inputTokens : null,
    outputTokens: hasTurnUsage ? outputTokens : null,
    durationMs: hasTurnUsage || isRunning ? durationMs : null,
  };
}

function formatNumber(value: number | null) {
  if (value == null) return '—';
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
