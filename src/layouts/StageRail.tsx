// 顶部阶段栏：弱化成页面级二级导航，同时保留会话统计。
import { ChevronRight } from '../components/Icons';
import { useChat } from '../features/chat/ChatContext';
import type { TranscriptEntry } from '../features/chat/TranscriptMessage';

type DisplayStageKey = 'idea' | 'execute' | 'writer' | 'reviewer';

const STAGES: Array<{ key: DisplayStageKey; label: string }> = [
  { key: 'idea', label: 'Idea' },
  { key: 'execute', label: 'Execute' },
  { key: 'writer', label: 'Writer' },
  { key: 'reviewer', label: 'Reviewer' },
];

export default function StageRail({ variant = 'page' }: { variant?: 'page' | 'hero' }) {
  const { inferredStage, transcript, chatState } = useChat();
  const activeStage = mapStage(inferredStage);
  const currentIndex =
    activeStage === 'idle' ? -1 : STAGES.findIndex((stage) => stage.key === activeStage);
  const metrics = summarizeTranscript(transcript, chatState === 'running');

  const rail = (
    <div
      className={[
        'flex items-center',
        variant === 'page'
          ? 'mx-auto w-full max-w-[980px] gap-8'
          : 'w-auto justify-center gap-0',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center">
        {STAGES.map((stage, index) => {
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          const dotClass = isCurrent ? 'bg-accent' : isDone ? 'bg-success' : 'bg-border-strong';

          return (
            <div key={stage.key} className="flex items-center">
              <div
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                  isCurrent
                    ? 'bg-accent text-accent-fg'
                    : variant === 'hero'
                      ? 'text-fg-muted'
                      : 'text-fg-subtle hover:text-fg-muted',
                ].join(' ')}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                <span>{stage.label}</span>
              </div>
              {index < STAGES.length - 1 && (
                <ChevronRight size={12} className="mx-1.5 text-fg-subtle" />
              )}
            </div>
          );
        })}
      </div>

      {variant === 'page' && (
        <div className="ml-auto flex items-center gap-4 text-[11px] font-mono text-fg-muted">
          <span>Input {formatNumber(metrics.inputTokens)}</span>
          <span>Output {formatNumber(metrics.outputTokens)}</span>
          <span>{formatDuration(metrics.durationMs)}</span>
          <span>{metrics.costUsd == null ? '—' : `$${metrics.costUsd.toFixed(4)}`}</span>
        </div>
      )}
    </div>
  );

  if (variant === 'hero') {
    return <div className="flex w-full justify-center">{rail}</div>;
  }

  return (
    <div className="flex h-[58px] items-center border-b border-border px-6">
      {rail}
    </div>
  );
}

function mapStage(
  stage: 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer' | 'idle',
): DisplayStageKey | 'idle' {
  switch (stage) {
    case 'planner':
      return 'idea';
    case 'datafetcher':
    case 'analyst':
      return 'execute';
    case 'writer':
      return 'writer';
    case 'reviewer':
      return 'reviewer';
    default:
      return 'idle';
  }
}

function summarizeTranscript(transcript: TranscriptEntry[], isRunning: boolean) {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let hasTurnUsage = false;

  for (const entry of transcript) {
    if (entry.kind !== 'turn_result') continue;
    hasTurnUsage = true;
    inputTokens += entry.inputTokens ?? 0;
    outputTokens += entry.outputTokens ?? 0;
    costUsd += entry.costUsd ?? 0;
  }

  const firstTs = transcript[0]?.ts;
  const lastTs = transcript[transcript.length - 1]?.ts;
  const durationMs =
    firstTs != null
      ? Math.max((isRunning ? Date.now() : lastTs ?? firstTs) - firstTs, 0)
      : 0;

  return {
    inputTokens: hasTurnUsage ? inputTokens : null,
    outputTokens: hasTurnUsage ? outputTokens : null,
    costUsd: hasTurnUsage ? costUsd : null,
    durationMs,
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
