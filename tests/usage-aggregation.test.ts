// UsagePage 的聚合函数烟测：确认 today / month / total 三个 bucket 的口径一致，
// 运行中的会话不会污染统计，按 provider / model 的分桶和"最贵会话 top 10"排序
// 正确。真实 UsagePage 组件是纯渲染，不值得跑 jsdom 测试。
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

  it('excludes running sessions from cost buckets and reports them separately', () => {
    const running = baseEntry({
      sessionId: 'r',
      finishReason: undefined,
      totalCostUsd: 999,
      totalTokens: 10,
    });
    const finished = baseEntry({ sessionId: 'f', totalCostUsd: 0.5, totalTokens: 200 });
    const result = aggregateUsage([running, finished]);
    expect(result.total.count).toBe(1);
    expect(result.total.costUsd).toBeCloseTo(0.5);
    expect(result.total.tokens).toBe(200);
    expect(result.runningCount).toBe(1);
  });

  it('groups by provider and sorts by cost desc', () => {
    const sessions: SessionLogEntry[] = [
      baseEntry({
        sessionId: 'a',
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        totalCostUsd: 1,
      }),
      baseEntry({
        sessionId: 'b',
        providerId: 'moonshot',
        providerLabel: 'Moonshot',
        totalCostUsd: 3,
      }),
      baseEntry({
        sessionId: 'c',
        providerId: 'moonshot',
        providerLabel: 'Moonshot',
        totalCostUsd: 2,
      }),
    ];
    const result = aggregateUsage(sessions);
    expect(result.topProviders.map((p) => p.label)).toEqual(['Moonshot', 'Anthropic']);
    expect(result.topProviders[0].bucket.costUsd).toBeCloseTo(5);
    expect(result.topProviders[0].bucket.count).toBe(2);
  });

  it('returns the 10 highest-cost completed sessions', () => {
    const sessions: SessionLogEntry[] = [];
    for (let i = 0; i < 15; i += 1) {
      sessions.push(baseEntry({ sessionId: `s${i}`, totalCostUsd: i * 0.1 }));
    }
    // 正在运行的高额会话也不该进 top list
    sessions.push(
      baseEntry({ sessionId: 'running', finishReason: undefined, totalCostUsd: 99 }),
    );
    const result = aggregateUsage(sessions);
    expect(result.topSessions).toHaveLength(10);
    // 前 10 应该是 s14..s5 排序
    const ids = result.topSessions.map((s) => s.sessionId);
    expect(ids[0]).toBe('s14');
    expect(ids[9]).toBe('s5');
    expect(ids).not.toContain('running');
  });

  it('counts today bucket based on local midnight', () => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const sessions: SessionLogEntry[] = [
      baseEntry({ sessionId: 'today', startedAt: now, totalCostUsd: 1 }),
      baseEntry({ sessionId: 'old', startedAt: oneWeekAgo, totalCostUsd: 2 }),
    ];
    const result = aggregateUsage(sessions);
    expect(result.today.count).toBe(1);
    expect(result.today.costUsd).toBeCloseTo(1);
    expect(result.total.count).toBe(2);
    expect(result.total.costUsd).toBeCloseTo(3);
  });
});
