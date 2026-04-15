import { useEffect, useState } from 'react';

import MarkdownContent from '../../components/MarkdownContent';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CoaseMark,
  Wrench,
} from '../../components/Icons';

export type TranscriptEntry =
  | { kind: 'status'; ts: number; text: string }
  | {
      kind: 'provider';
      ts: number;
      text: string;
      providerId?: string;
      providerLabel?: string;
      model: string;
      baseURL?: string;
    }
  | { kind: 'user'; ts: number; text: string }
  | {
      kind: 'assistant';
      ts: number;
      text: string;
      messageId?: string;
      streaming?: boolean;
    }
  | { kind: 'guidance'; ts: number; text: string }
  | {
      kind: 'subagent';
      ts: number;
      phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
      text: string;
      taskId?: string;
      description?: string;
      lastToolName?: string;
      toolUses?: number;
      durationMs?: number;
      totalTokens?: number;
    }
  | {
      kind: 'thinking';
      ts: number;
      text: string;
      messageId?: string;
    }
  | {
      kind: 'tool_use';
      ts: number;
      name: string;
      input: unknown;
      toolUseId?: string;
      parentToolUseId?: string | null;
      elapsedSeconds?: number;
      status?: 'running' | 'done';
    }
  | {
      kind: 'tool_result';
      ts: number;
      text: string;
      isError: boolean;
      toolUseId?: string;
    }
  | { kind: 'error'; ts: number; text: string }
  | {
      kind: 'turn_result';
      ts: number;
      ok: boolean;
      detail: string;
      turns?: number;
      durationMs?: number;
      costUsd?: number;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheCreationInputTokens?: number;
      cacheReadInputTokens?: number;
    };

type SubagentPhase = 'started' | 'progress' | 'completed' | 'failed' | 'stopped';

const COLLAPSIBLE_PILL_CLASS =
  'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] text-fg-muted transition hover:bg-black/[0.035] hover:text-fg-subtle dark:hover:bg-white/[0.04]';
const COLLAPSIBLE_ICON_CLASS = 'text-fg-subtle/90';
const COLLAPSIBLE_CHEVRON_CLASS = 'text-fg-subtle/80';

export default function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false });
  const [expanded, setExpanded] = useState(false);

  switch (entry.kind) {
    case 'status':
      if (shouldHideStatus(entry.text)) return null;
      return <DividerLabel text={entry.text} />;
    case 'provider':
      return null;
    case 'turn_result':
      return (
        <DividerLabel
          text={`回合${entry.ok ? '完成' : '失败'} 路 ${entry.detail}`}
          danger={!entry.ok}
        />
      );
    case 'user':
      return (
        <div className="flex self-end">
          <div className="max-w-[80%]">
            <div className="mb-1 text-right text-[11px] text-fg-subtle">你 路 {time}</div>
            <div className="rounded-2xl rounded-tr-md border border-border bg-surface px-4 py-3 text-[14px] whitespace-pre-wrap text-fg">
              {entry.text}
            </div>
          </div>
        </div>
      );
    case 'guidance':
      return (
        <div className="flex self-end">
          <div className="max-w-[80%]">
            <div className="mb-1 text-right text-[11px] text-fg-subtle">指导 路 {time}</div>
            <div className="rounded-2xl rounded-tr-md border border-border-strong bg-app px-4 py-3 text-[14px] whitespace-pre-wrap text-fg">
              {entry.text}
            </div>
          </div>
        </div>
      );
    case 'subagent': {
      const label = getSubagentPhaseLabel(entry.phase);
      const metaParts: string[] = [];
      if (typeof entry.toolUses === 'number') metaParts.push(`${entry.toolUses} 调用`);
      if (typeof entry.durationMs === 'number') metaParts.push(formatDuration(entry.durationMs));
      if (typeof entry.totalTokens === 'number') metaParts.push(formatTokens(entry.totalTokens));
      const headline = entry.lastToolName ? `最近：${entry.lastToolName}` : entry.text;
      return (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={COLLAPSIBLE_PILL_CLASS}
          >
            <CoaseMark size={10} className={COLLAPSIBLE_ICON_CLASS} />
            <span className="font-medium text-fg-muted">Subagent</span>
            <span className="text-[10px] uppercase tracking-wide text-fg-subtle/90">{label}</span>
            {metaParts.length > 0 && (
              <span className="text-[10px] text-fg-subtle/80">{metaParts.join(' 路 ')}</span>
            )}
            {entry.phase === 'progress' && (
              <span className="text-[10px] text-fg-subtle/70">{headline}</span>
            )}
            {expanded ? (
              <ChevronUp size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            ) : (
              <ChevronDown size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            )}
          </button>
          {expanded && (
            <div className="mt-1 space-y-1 rounded-2xl border border-border/60 bg-surface px-2 py-2 text-[10.5px] leading-5 text-fg-muted">
              {entry.description && entry.description !== entry.text && (
                <div className="text-fg-subtle">{entry.description}</div>
              )}
              <div>{entry.text}</div>
              {entry.lastToolName && (
                <div className="text-fg-subtle">当前工具：{entry.lastToolName}</div>
              )}
            </div>
          )}
        </div>
      );
    }
    case 'thinking':
      return <ThinkingPill text={entry.text} />;
    case 'assistant':
      return (
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg-muted">
            <CoaseMark size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-fg-subtle">
              <span>Coase 路 {time}</span>
              {entry.streaming && <span className="text-accent">正在生成…</span>}
            </div>
            <MarkdownContent
              content={entry.text}
              className="text-[14px] leading-[1.7] text-fg [&_a]:text-fg [&_code]:text-[0.95em]"
            />
          </div>
        </div>
      );
    case 'tool_use': {
      const running = entry.status === 'running';
      return (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={COLLAPSIBLE_PILL_CLASS}
          >
            <Wrench size={10} className={COLLAPSIBLE_ICON_CLASS} />
            <span className="font-medium text-fg-muted">{entry.name}</span>
            {running && <LiveTimer elapsedSeconds={entry.elapsedSeconds ?? 0} baseTs={entry.ts} />}
            {expanded ? (
              <ChevronUp size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            ) : (
              <ChevronDown size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            )}
          </button>
          {expanded && (
            <pre className="mt-1 overflow-x-auto rounded-2xl border border-border/60 bg-surface p-2 text-[10.5px] whitespace-pre-wrap text-fg-muted">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
          )}
        </div>
      );
    }
    case 'tool_result': {
      const label = entry.isError ? 'Error' : 'Output';
      return (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={COLLAPSIBLE_PILL_CLASS}
          >
            {entry.isError ? (
              <AlertCircle size={10} className={COLLAPSIBLE_ICON_CLASS} />
            ) : (
              <Check size={10} className={COLLAPSIBLE_ICON_CLASS} />
            )}
            <span className="font-medium text-fg-muted">{label}</span>
            {expanded ? (
              <ChevronUp size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            ) : (
              <ChevronDown size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
            )}
          </button>
          {expanded && (
            <pre className="mt-1 overflow-x-auto rounded-2xl border border-border/60 bg-surface p-2 text-[10.5px] whitespace-pre-wrap text-fg-muted">
              {entry.text}
            </pre>
          )}
        </div>
      );
    }
    case 'error':
      return (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-[13px] text-danger">{entry.text}</div>
        </div>
      );
  }
}

function shouldHideStatus(text: string) {
  return /^本次研究可按需调用\s+\d+\s+个子代理$/.test(text.trim());
}

function DividerLabel({ text, danger = false }: { text: string; danger?: boolean }) {
  const cls = danger ? 'text-danger' : 'text-fg-subtle';
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 border-t border-dashed border-border" />
      <div className={`text-[11px] font-mono ${cls}`}>{text}</div>
      <div className="h-px flex-1 border-t border-dashed border-border" />
    </div>
  );
}

function getSubagentPhaseLabel(phase: SubagentPhase) {
  switch (phase) {
    case 'started':
      return 'Start';
    case 'progress':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return 'Stopped';
  }
}

function LiveTimer({ elapsedSeconds, baseTs }: { elapsedSeconds: number; baseTs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const local = Math.max(0, Math.floor((now - baseTs) / 1000));
  const display = Math.max(elapsedSeconds, local);
  if (display < 1) return null;
  return (
    <span className="text-[10px] tabular-nums text-fg-subtle/80">{formatSeconds(display)}</span>
  );
}

function ThinkingPill({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.trim().split(/\r?\n/)[0]?.slice(0, 60) ?? 'thinking';
  return (
    <div className="-mt-3">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`${COLLAPSIBLE_PILL_CLASS} italic`}
      >
        <CoaseMark size={10} className={COLLAPSIBLE_ICON_CLASS} />
        <span className="font-medium text-fg-muted">thinking</span>
        <span className="text-[10px] text-fg-subtle/80">{preview}</span>
        {expanded ? (
          <ChevronUp size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
        ) : (
          <ChevronDown size={9} className={COLLAPSIBLE_CHEVRON_CLASS} />
        )}
      </button>
      {expanded && (
        <div className="mt-1 rounded-2xl border border-border/60 bg-surface px-2 py-2 text-[10.5px] leading-5 text-fg-muted whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}

function formatDuration(ms: number): string {
  return formatSeconds(Math.round(ms / 1000));
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tok`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k tok`;
  return `${tokens} tok`;
}
