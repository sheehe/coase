// Usage 统计的纯逻辑层。独立出来是为了让 vitest 可以在 Node 环境下直接 import，
// 不必把整页 TSX + React + react-router 一起拉进测试。
import type { SessionLogEntry } from '../../shared/runs';

export interface Bucket {
  count: number;
  costUsd: number;
  tokens: number;
  durationMs: number;
}

export interface Breakdown<K> {
  key: K;
  label: string;
  bucket: Bucket;
}

export const EMPTY_BUCKET: Bucket = { count: 0, costUsd: 0, tokens: 0, durationMs: 0 };

function fold(bucket: Bucket, entry: SessionLogEntry): Bucket {
  return {
    count: bucket.count + 1,
    costUsd: bucket.costUsd + (entry.totalCostUsd ?? 0),
    tokens: bucket.tokens + (entry.totalTokens ?? 0),
    durationMs: bucket.durationMs + (entry.totalDurationMs ?? 0),
  };
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function monthStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function aggregateUsage(sessions: SessionLogEntry[]) {
  const now = Date.now();
  const today0 = dayStart(now);
  const month0 = monthStart(now);

  let todayBucket = EMPTY_BUCKET;
  let monthBucket = EMPTY_BUCKET;
  let totalBucket = EMPTY_BUCKET;

  const perProvider = new Map<string, Breakdown<string>>();
  const perModel = new Map<string, Breakdown<string>>();

  for (const entry of sessions) {
    // 仍在运行中的会话的累计字段只是占位，不参与真实汇总。
    if (entry.finishReason === undefined) continue;

    totalBucket = fold(totalBucket, entry);
    if (entry.startedAt >= month0) monthBucket = fold(monthBucket, entry);
    if (entry.startedAt >= today0) todayBucket = fold(todayBucket, entry);

    const providerKey = entry.providerId ?? entry.providerLabel ?? '(unknown)';
    const providerLabel = entry.providerLabel ?? entry.providerId ?? '(未命名)';
    const priorProvider = perProvider.get(providerKey);
    perProvider.set(providerKey, {
      key: providerKey,
      label: providerLabel,
      bucket: fold(priorProvider?.bucket ?? EMPTY_BUCKET, entry),
    });

    const modelKey = entry.model || '(unknown)';
    const priorModel = perModel.get(modelKey);
    perModel.set(modelKey, {
      key: modelKey,
      label: modelKey,
      bucket: fold(priorModel?.bucket ?? EMPTY_BUCKET, entry),
    });
  }

  const runningCount = sessions.filter((s) => s.finishReason === undefined).length;

  const topProviders = [...perProvider.values()].sort(
    (a, b) => b.bucket.costUsd - a.bucket.costUsd,
  );
  const topModels = [...perModel.values()].sort((a, b) => b.bucket.costUsd - a.bucket.costUsd);
  const topSessions = [...sessions]
    .filter((s) => s.finishReason !== undefined && (s.totalCostUsd ?? 0) > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
    .slice(0, 10);

  return {
    today: todayBucket,
    month: monthBucket,
    total: totalBucket,
    runningCount,
    topProviders,
    topModels,
    topSessions,
  };
}
