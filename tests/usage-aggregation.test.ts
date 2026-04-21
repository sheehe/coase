// UsagePage 的聚合函数烟测：确认 today / month / total 三个 bucket 的口径一致，
// 运行中的会话不会污染统计，按 provider / model 的分桶和"最高用量会话 top 10"排序
// 正确。Bucket 当前只按 token 维度聚合（cost 不再展示给用户）。
// 真实 UsagePage 组件是纯渲染，不值得跑 jsdom 测试。
import { describe, expect, it } from 'vitest';

import { aggregateUsage } from '../src/pages/usage-aggregation';
import type { SessionLogEntry } from '../shared/runs';

function baseEntry(overrides: Partial<SessionLogEntry>): SessionLogEntry {
  return {
    sessionId: 's-1',
    finishReason: 'agent_done',
    startedAt: Date.now(),
    endedAt: Date.now(),
    firstPrompt: 'prompt',
    providerSource: 'config',
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    model: 'claude-opus-4-6',
    userMessageCount: 1,
    agentTurnCount: 1,
    totalDurationMs: 1000,
    totalCostUsd: 0.1,
    totalTokens: 1000,
    totalInputTokens: 700,
    totalOutputTokens: 300,
    totalCacheTokens: 0,
    ok: true,
    ...overrides,
  };
}

describe('aggregateUsage', () => {
  it('returns empty buckets when there are no sessions', () => {
    const result = aggregateUsage([]);
    expect(result.today.count).toBe(0);
    expect(result.total.count).toBe(0);
    expect(result.runningCount).toBe(0);
    expect(result.topProviders).toEqual([]);
    expect(result.topSessions).toEqual([]);
  });

  it('excludes running sessions from token buckets and reports them separately', () => {
    const running = baseEntry({
      sessionId: 'r',
      finishReason: undefined,
      totalTokens: 999_999,
      totalInputTokens: 500_000,
      totalOutputTokens: 499_999,
    });
    const finished = baseEntry({
      sessionId: 'f',
      totalTokens: 200,
      totalInputTokens: 150,
      totalOutputTokens: 50,
    });
    const result = aggregateUsage([running, finished]);
    expect(result.total.count).toBe(1);
    expect(result.total.totalTokens).toBe(200);
    expect(result.total.inputTokens).toBe(150);
    expect(result.total.outputTokens).toBe(50);
    expect(result.runningCount).toBe(1);
  });

  it('groups by provider and sorts by total tokens desc', () => {
    const sessions: SessionLogEntry[] = [
      baseEntry({
        sessionId: 'a',
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        totalTokens: 1000,
        totalInputTokens: 700,
        totalOutputTokens: 300,
      }),
      baseEntry({
        sessionId: 'b',
        providerId: 'moonshot',
        providerLabel: 'Moonshot',
        totalTokens: 3000,
        totalInputTokens: 2000,
        totalOutputTokens: 1000,
      }),
      baseEntry({
        sessionId: 'c',
        providerId: 'moonshot',
        providerLabel: 'Moonshot',
        totalTokens: 2000,
        totalInputTokens: 1500,
        totalOutputTokens: 500,
      }),
    ];
    const result = aggregateUsage(sessions);
    expect(result.topProviders.map((p) => p.label)).toEqual(['Moonshot', 'Anthropic']);
    expect(result.topProviders[0].bucket.totalTokens).toBe(5000);
    expect(result.topProviders[0].bucket.count).toBe(2);
  });

  it('returns the 10 highest-token completed sessions', () => {
    const sessions: SessionLogEntry[] = [];
    for (let i = 0; i < 15; i += 1) {
      sessions.push(
        baseEntry({
          sessionId: `s${i}`,
          totalTokens: i * 100,
          totalInputTokens: i * 70,
          totalOutputTokens: i * 30,
        }),
      );
    }
    // 正在运行的高用量会话也不该进 top list
    sessions.push(
      baseEntry({
        sessionId: 'running',
        finishReason: undefined,
        totalTokens: 99_999_999,
        totalInputTokens: 50_000_000,
        totalOutputTokens: 49_999_999,
      }),
    );
    const result = aggregateUsage(sessions);
    expect(result.topSessions).toHaveLength(10);
    // 前 10 应该是 s14..s5 排序
    const ids = result.topSessions.map((s) => s.entry.sessionId);
    expect(ids[0]).toBe('s14');
    expect(ids[9]).toBe('s5');
    expect(ids).not.toContain('running');
  });

  it('counts today bucket based on local midnight', () => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const sessions: SessionLogEntry[] = [
      baseEntry({
        sessionId: 'today',
        startedAt: now,
        totalTokens: 100,
        totalInputTokens: 70,
        totalOutputTokens: 30,
      }),
      baseEntry({
        sessionId: 'old',
        startedAt: oneWeekAgo,
        totalTokens: 200,
        totalInputTokens: 140,
        totalOutputTokens: 60,
      }),
    ];
    const result = aggregateUsage(sessions);
    expect(result.today.count).toBe(1);
    expect(result.today.totalTokens).toBe(100);
    expect(result.total.count).toBe(2);
    expect(result.total.totalTokens).toBe(300);
  });

  it('falls back to totalTokens for legacy records without breakdown fields', () => {
    const legacy: SessionLogEntry = {
      sessionId: 'legacy',
      finishReason: 'agent_done',
      startedAt: Date.now(),
      endedAt: Date.now(),
      firstPrompt: 'legacy',
      providerSource: 'config',
      providerId: 'anthropic',
      providerLabel: 'Anthropic',
      model: 'claude-opus-4-6',
      userMessageCount: 1,
      agentTurnCount: 1,
      totalDurationMs: 1000,
      totalCostUsd: 0,
      totalTokens: 500,
      ok: true,
    };
    const result = aggregateUsage([legacy]);
    expect(result.total.totalTokens).toBe(500);
    // 老记录没有分项，input 退化成 totalTokens，output / cache 为 0。
    expect(result.total.inputTokens).toBe(500);
    expect(result.total.outputTokens).toBe(0);
    expect(result.total.cacheTokens).toBe(0);
  });
});
