// Usage 统计的纯逻辑层。独立出来是为了让 vitest 可以在 Node 环境下直接 import，
// 不必把整页 TSX + React + react-router 一起拉进测试。
//
// 当前设计：只聚合 token 分项（input / output / cache），不再聚合 cost。
// 原因：
//   1) 国产 Anthropic 兼容 provider 的 total_cost_usd 常为 0 或空，混入 USD
//      汇总只会误导用户；
//   2) 不同 provider 币种不同，强行相加语义不一致。
import type { SessionLogEntry } from '../../shared/runs';

export interface Bucket {
  count: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface Breakdown<K> {
  key: K;
  label: string;
  bucket: Bucket;
}

export const EMPTY_BUCKET: Bucket = {
  count: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  totalTokens: 0,
  durationMs: 0,
};

function tokensOf(entry: SessionLogEntry): {
  input: number;
  output: number;
  cache: number;
  total: number;
} {
  // 兼容老记录：只有 totalTokens 的会话把总量挂到 input 侧，cache 置 0，这样
  // 求和依然等于 totalTokens，不会凭空多出。
  const hasBreakdown =
    entry.totalInputTokens !== undefined ||
    entry.totalOutputTokens !== undefined ||
    entry.totalCacheTokens !== undefined;

  const input = entry.totalInputTokens ?? (hasBreakdown ? 0 : entry.totalTokens ?? 0);
  const output = entry.totalOutputTokens ?? 0;
  const cache = entry.totalCacheTokens ?? 0;
  const total = entry.totalTokens ?? input + output + cache;
  return { input, output, cache, total };
}

function fold(bucket: Bucket, entry: SessionLogEntry): Bucket {
  const t = tokensOf(entry);
  return {
    count: bucket.count + 1,
    inputTokens: bucket.inputTokens + t.input,
    outputTokens: bucket.outputTokens + t.output,
    cacheTokens: bucket.cacheTokens + t.cache,
    totalTokens: bucket.totalTokens + t.total,
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

export interface SessionTokenRow {
  entry: SessionLogEntry;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
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

  // 按总 token 数降序，作为"用量最高的会话"榜单依据。
  const topSessions: SessionTokenRow[] = sessions
    .filter((s) => s.finishReason !== undefined)
    .map((entry) => {
      const t = tokensOf(entry);
      return {
        entry,
        inputTokens: t.input,
        outputTokens: t.output,
        cacheTokens: t.cache,
        totalTokens: t.total,
      };
    })
    .filter((row) => row.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);

  const topProviders = [...perProvider.values()].sort(
    (a, b) => b.bucket.totalTokens - a.bucket.totalTokens,
  );
  const topModels = [...perModel.values()].sort(
    (a, b) => b.bucket.totalTokens - a.bucket.totalTokens,
  );

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
