// Token / 成本面板：把 sessions.jsonl 里沉淀下来的累计数据按今天 / 本月 / 历史
// 三个窗口汇总，辅以按 provider 和按模型的拆分，以及最近成本最高的几条会话。
//
// 数据来源是 window.coase.sessions.recent——它背后会走 dedupByLastOccurrence，
// 所以每个 sessionId 只会出现一次，totalCostUsd / totalTokens 是"这条研究线
// 自首次启动以来的累计"。正在运行中的会话 finishReason===undefined，这里会
// 被显式标出来而不是混进完成值。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronLeft, RefreshCw } from '../components/Icons';
import Button from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import type { SessionLogEntry } from '../../shared/runs';
import { aggregateUsage, type Breakdown, type Bucket } from './usage-aggregation';

function formatCost(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '–';
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
      // 500 条足够覆盖几个月内的常用研究工作流，避免一次全量 parse 过大。
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-col gap-6 overflow-y-auto px-8 py-8">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg">用量与花销</h2>
            <p className="mt-1 text-sm text-fg-muted">
              按今天 / 本月 / 累计聚合 Coase 会话的 token 消耗与成本，数据来自
              本地 sessions.jsonl，仅统计已完成或中断的会话。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()} className="gap-1.5">
              <RefreshCw size={12} />
              刷新
            </Button>
            <Link
              to="/chat"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg-muted transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
            >
              <ChevronLeft size={14} />
              <span>返回对话</span>
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          会话历史读取失败：{error}
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-fg-subtle">
          正在读取会话历史…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <BucketCard title="今天" bucket={usage.today} />
            <BucketCard title="本月" bucket={usage.month} />
            <BucketCard title="累计" bucket={usage.total} extra={
              usage.runningCount > 0 ? `另有 ${usage.runningCount} 个会话运行中` : undefined
            } />
          </section>

          <BreakdownCard title="按模型提供方" rows={usage.topProviders} />
          <BreakdownCard title="按模型" rows={usage.topModels} />

          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-fg">花销最高的会话</h3>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                列出 totalCostUsd 最高的前 10 条会话。续跑会累加到同一条。
              </p>
            </CardHeader>
            <CardBody className="p-0">
              {usage.topSessions.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-fg-subtle">
                  还没有可统计的会话花销。
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {usage.topSessions.map((entry) => (
                    <li key={entry.sessionId} className="flex items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-fg">
                          {entry.firstPrompt || '(无标题)'}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-fg-muted">
                          <span>{formatDateTime(entry.startedAt)}</span>
                          <span>·</span>
                          <span className="font-mono">{entry.model || '未知模型'}</span>
                          {entry.providerLabel && (
                            <>
                              <span>·</span>
                              <span>{entry.providerLabel}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end text-right">
                        <span className="text-[13px] font-semibold text-fg">
                          {formatCost(entry.totalCostUsd ?? 0)}
                        </span>
                        <span className="text-[11px] text-fg-muted">
                          {formatTokens(entry.totalTokens ?? 0)} tokens · {formatDuration(entry.totalDurationMs ?? 0)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function BucketCard({
  title,
  bucket,
  extra,
}: {
  title: string;
  bucket: Bucket;
  extra?: string;
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">{title}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-fg">{formatCost(bucket.costUsd)}</span>
          <span className="text-[12px] text-fg-muted">{bucket.count} 次会话</span>
        </div>
        <div className="text-[12px] text-fg-muted">
          {formatTokens(bucket.tokens)} tokens · {formatDuration(bucket.durationMs)}
        </div>
        {extra && <div className="text-[11px] text-accent">{extra}</div>}
      </CardBody>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: Breakdown<string>[];
}) {
  if (rows.length === 0) return null;
  const maxCost = Math.max(...rows.map((r) => r.bucket.costUsd), 0.0001);
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const pct = Math.min(100, (row.bucket.costUsd / maxCost) * 100);
            return (
              <li key={row.key} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-[13px] text-fg">{row.label}</span>
                  <span className="shrink-0 text-[12px] font-semibold text-fg">
                    {formatCost(row.bucket.costUsd)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-[11px] text-fg-muted">
                  <span>
                    {row.bucket.count} 次 · {formatTokens(row.bucket.tokens)} tokens
                  </span>
                  <span>{formatDuration(row.bucket.durationMs)}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full rounded-full bg-accent/80"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
