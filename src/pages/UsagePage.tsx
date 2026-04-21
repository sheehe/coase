import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeft } from '../components/Icons';
import { Card, CardBody } from '../components/ui/Card';
import type { SessionLogEntry } from '../../shared/runs';
import {
  aggregateUsage,
  type Breakdown,
  type Bucket,
  type SessionTokenRow,
} from './usage-aggregation';

function formatTokens(value: number): string {
  if (value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function UsagePage() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recent = await window.coase.sessions.recent(500);
      setSessions(recent);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usage = useMemo(() => aggregateUsage(sessions), [sessions]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-5 px-8 py-8">
      <section className="flex items-start justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.2em] text-fg-subtle">Usage</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg">用量</h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            按今天、本月、累计聚合 Coase 会话的 token 输入 / 输出量与运行时长。数据来自本地
            <span className="mx-1 font-mono text-fg-subtle">sessions.jsonl</span>
            ，仅统计已完成或中断的会话。
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-black/[0.03] hover:text-fg dark:hover:bg-white/[0.04]"
          >
            <ChevronLeft size={13} />
            <span>返回对话</span>
          </Link>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          会话历史读取失败：{error}
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-fg-subtle">
          正在读取会话历史…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <SummaryPanel title="今天" bucket={usage.today} />
            <SummaryPanel title="本月" bucket={usage.month} />
            <SummaryPanel
              title="累计"
              bucket={usage.total}
              aside={usage.runningCount > 0 ? `另有 ${usage.runningCount} 个会话运行中` : undefined}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <BreakdownPanel title="按模型提供方" rows={usage.topProviders} />
            <BreakdownPanel title="按模型" rows={usage.topModels} />
          </section>

          <Card className="overflow-hidden">
            <CardBody className="border-b border-border px-5 py-4">
              <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                每次会话 token 消耗
              </div>
              <div className="mt-1 text-[13px] leading-6 text-fg-muted">
                列出 token 消耗最高的前 10 条会话。续跑会累加到同一条记录。
              </div>
            </CardBody>

            {usage.topSessions.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-fg-subtle">
                还没有可统计的会话用量。
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {usage.topSessions.map((row, index) => (
                  <SessionRow key={row.entry.sessionId} row={row} index={index} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryPanel({
  title,
  bucket,
  aside,
}: {
  title: string;
  bucket: Bucket;
  aside?: string;
}) {
  return (
    <Card className="rounded-[24px]">
      <CardBody className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[12px] uppercase tracking-[0.18em] text-fg-subtle">{title}</div>
          {aside && (
            <div className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted">
              {aside}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-[34px] font-semibold tracking-[-0.04em] text-fg">
            {formatTokens(bucket.totalTokens)}
          </span>
          <span className="text-[13px] text-fg-muted">tokens · {bucket.count} 次会话</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
          <span>
            输入 <span className="font-medium text-fg">{formatTokens(bucket.inputTokens)}</span>
          </span>
          <span>
            输出 <span className="font-medium text-fg">{formatTokens(bucket.outputTokens)}</span>
          </span>
          {bucket.cacheTokens > 0 && (
            <span>
              缓存 <span className="font-medium text-fg">{formatTokens(bucket.cacheTokens)}</span>
            </span>
          )}
          <span>·</span>
          <span>{formatDuration(bucket.durationMs)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

function BreakdownPanel({
  title,
  rows,
}: {
  title: string;
  rows: Breakdown<string>[];
}) {
  if (rows.length === 0) return null;

  const maxTokens = Math.max(...rows.map((row) => row.bucket.totalTokens), 1);

  return (
    <Card className="overflow-hidden">
      <CardBody className="border-b border-border px-5 py-4">
        <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">{title}</div>
      </CardBody>

      <ul className="divide-y divide-border">
        {rows.map((row, index) => {
          const pct = Math.min(100, (row.bucket.totalTokens / maxTokens) * 100);
          return (
            <li key={row.key} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium tabular-nums text-fg-subtle">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[14px] text-fg">{row.label}</span>
                  </div>
                  <div className="ml-8 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
                    <span>{row.bucket.count} 次</span>
                    <span>输入 {formatTokens(row.bucket.inputTokens)}</span>
                    <span>输出 {formatTokens(row.bucket.outputTokens)}</span>
                    {row.bucket.cacheTokens > 0 && (
                      <span>缓存 {formatTokens(row.bucket.cacheTokens)}</span>
                    )}
                    <span>{formatDuration(row.bucket.durationMs)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-medium text-fg">
                    {formatTokens(row.bucket.totalTokens)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">tokens</div>
                </div>
              </div>

              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-border/70">
                <div className="h-full rounded-full bg-accent/75" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SessionRow({ row, index }: { row: SessionTokenRow; index: number }) {
  const { entry } = row;
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_170px] items-start gap-4 px-5 py-4">
      <div className="pt-0.5 text-[12px] font-medium tabular-nums text-fg-subtle">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[14px] leading-6 text-fg">
          {entry.firstPrompt || '(无标题)'}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          <span>{formatDateTime(entry.startedAt)}</span>
          <span>{entry.model || '未知模型'}</span>
          {entry.providerLabel && <span>{entry.providerLabel}</span>}
        </div>
      </div>

      <div className="text-right">
        <div className="text-[14px] font-medium text-fg">{formatTokens(row.totalTokens)} tokens</div>
        <div className="mt-1 text-[12px] text-fg-muted">
          入 {formatTokens(row.inputTokens)} · 出 {formatTokens(row.outputTokens)}
          {row.cacheTokens > 0 && <> · 缓存 {formatTokens(row.cacheTokens)}</>}
        </div>
        <div className="text-[12px] text-fg-muted">{formatDuration(entry.totalDurationMs ?? 0)}</div>
      </div>
    </li>
  );
}
