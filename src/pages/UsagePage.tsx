import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function formatDateTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function UsagePage() {
  const { t, i18n } = useTranslation('usage');
  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';
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

  const usage = useMemo(
    () => aggregateUsage(sessions, { unnamedLabel: t('providerUnnamed') }),
    [sessions, t],
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-5 px-8 py-8">
      <section className="flex items-start justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.2em] text-fg-subtle">
            {t('kicker')}
          </div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-fg-muted">
            {t('description')}
            <span className="mx-1 font-mono text-fg-subtle">sessions.jsonl</span>
            {t('descriptionTail')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-black/[0.03] hover:text-fg dark:hover:bg-white/[0.04]"
          >
            <ChevronLeft size={13} />
            <span>{t('backToChat')}</span>
          </Link>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('loadError', { message: error })}
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-fg-subtle">
          {t('loading')}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <SummaryPanel title={t('buckets.today')} bucket={usage.today} />
            <SummaryPanel title={t('buckets.month')} bucket={usage.month} />
            <SummaryPanel
              title={t('buckets.total')}
              bucket={usage.total}
              aside={
                usage.runningCount > 0
                  ? t('extraRunning', { count: usage.runningCount })
                  : undefined
              }
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <BreakdownPanel title={t('breakdown.byProvider')} rows={usage.topProviders} />
            <BreakdownPanel title={t('breakdown.byModel')} rows={usage.topModels} />
          </section>

          <Card className="overflow-hidden">
            <CardBody className="border-b border-border px-5 py-4">
              <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
                {t('topSessions.title')}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-fg-muted">
                {t('topSessions.subtitle')}
              </div>
            </CardBody>

            {usage.topSessions.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-fg-subtle">
                {t('topSessions.empty')}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {usage.topSessions.map((row, index) => (
                  <SessionRow key={row.entry.sessionId} row={row} index={index} locale={locale} />
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
  const { t } = useTranslation('usage');
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
          <span className="text-[13px] text-fg-muted">
            {t('tokensSuffix')} · {t('sessionsCount', { count: bucket.count })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
          <span>
            {t('input')}{' '}
            <span className="font-medium text-fg">{formatTokens(bucket.inputTokens)}</span>
          </span>
          <span>
            {t('output')}{' '}
            <span className="font-medium text-fg">{formatTokens(bucket.outputTokens)}</span>
          </span>
          {bucket.cacheTokens > 0 && (
            <span>
              {t('cache')}{' '}
              <span className="font-medium text-fg">{formatTokens(bucket.cacheTokens)}</span>
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
  const { t } = useTranslation('usage');
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
                    <span>{t('breakdown.times', { count: row.bucket.count })}</span>
                    <span>
                      {t('input')} {formatTokens(row.bucket.inputTokens)}
                    </span>
                    <span>
                      {t('output')} {formatTokens(row.bucket.outputTokens)}
                    </span>
                    {row.bucket.cacheTokens > 0 && (
                      <span>
                        {t('cache')} {formatTokens(row.bucket.cacheTokens)}
                      </span>
                    )}
                    <span>{formatDuration(row.bucket.durationMs)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-medium text-fg">
                    {formatTokens(row.bucket.totalTokens)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">{t('tokensSuffix')}</div>
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

function SessionRow({
  row,
  index,
  locale,
}: {
  row: SessionTokenRow;
  index: number;
  locale: string;
}) {
  const { t } = useTranslation('usage');
  const { entry } = row;
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_170px] items-start gap-4 px-5 py-4">
      <div className="pt-0.5 text-[12px] font-medium tabular-nums text-fg-subtle">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[14px] leading-6 text-fg">
          {entry.firstPrompt || t('topSessions.untitled')}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          <span>{formatDateTime(entry.startedAt, locale)}</span>
          <span>{entry.model || t('topSessions.unknownModel')}</span>
          {entry.providerLabel && <span>{entry.providerLabel}</span>}
        </div>
      </div>

      <div className="text-right">
        <div className="text-[14px] font-medium text-fg">
          {formatTokens(row.totalTokens)} {t('topSessions.tokensSuffix')}
        </div>
        <div className="mt-1 text-[12px] text-fg-muted">
          {t('topSessions.inputShort')} {formatTokens(row.inputTokens)} ·{' '}
          {t('topSessions.outputShort')} {formatTokens(row.outputTokens)}
          {row.cacheTokens > 0 && (
            <>
              {' '}
              · {t('topSessions.cacheShort')} {formatTokens(row.cacheTokens)}
            </>
          )}
        </div>
        <div className="text-[12px] text-fg-muted">{formatDuration(entry.totalDurationMs ?? 0)}</div>
      </div>
    </li>
  );
}
