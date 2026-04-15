// Session log 的冒烟测试线。覆盖三个 P0 逻辑：
//   1. appendSessionLog + readRecentSessions：末条胜出的 dedup 正确；
//   2. sealOrphanedSessions：把 finishReason===undefined 的孤儿补成 error；
//   3. compactSessionLog：重写后 dedup 生效，读回仍然只剩最新快照。
//
// 这些是近期 P0 bug 的根部，没有测试每次改都靠肉眼。
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setSessionLogPathForTests,
  appendSessionLog,
  compactSessionLog,
  deleteSessionLog,
  loadSessionEntry,
  readRecentSessions,
  sealOrphanedSessions,
} from '../agent/logging/session-log';
import type { SessionLogEntry } from '../shared/runs';

function baseEntry(overrides: Partial<SessionLogEntry>): SessionLogEntry {
  return {
    sessionId: 's-1',
    finishReason: 'agent_done',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_000_500,
    firstPrompt: 'test prompt',
    providerSource: 'config',
    model: 'claude-test',
    userMessageCount: 1,
    agentTurnCount: 1,
    totalDurationMs: 500,
    totalCostUsd: 0.01,
    totalTokens: 1000,
    ok: true,
    ...overrides,
  };
}

let tempDir: string;
let logPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'coase-session-log-'));
  logPath = join(tempDir, 'sessions.jsonl');
  __setSessionLogPathForTests(logPath);
});

afterEach(() => {
  __setSessionLogPathForTests(null);
  rmSync(tempDir, { recursive: true, force: true });
});

describe('appendSessionLog + readRecentSessions', () => {
  it('returns empty array when file does not exist', async () => {
    const result = await readRecentSessions();
    expect(result).toEqual([]);
  });

  it('dedups by last occurrence so placeholder is overwritten by final entry', async () => {
    // 先写一条占位
    await appendSessionLog(
      baseEntry({
        sessionId: 'running-1',
        finishReason: undefined,
        model: '(运行中)',
        totalCostUsd: 0,
      }),
    );
    // 再写最终状态
    await appendSessionLog(
      baseEntry({
        sessionId: 'running-1',
        finishReason: 'agent_done',
        model: 'claude-opus-4-6',
        totalCostUsd: 0.42,
      }),
    );

    const result = await readRecentSessions();
    expect(result).toHaveLength(1);
    expect(result[0].finishReason).toBe('agent_done');
    expect(result[0].model).toBe('claude-opus-4-6');
    expect(result[0].totalCostUsd).toBeCloseTo(0.42);
  });

  it('orders entries by startedAt desc and respects limit', async () => {
    await appendSessionLog(baseEntry({ sessionId: 'a', startedAt: 100 }));
    await appendSessionLog(baseEntry({ sessionId: 'b', startedAt: 300 }));
    await appendSessionLog(baseEntry({ sessionId: 'c', startedAt: 200 }));
    const result = await readRecentSessions(2);
    expect(result.map((e) => e.sessionId)).toEqual(['b', 'c']);
  });

  it('skips malformed lines without crashing', async () => {
    await appendSessionLog(baseEntry({ sessionId: 'ok' }));
    // 手写一行坏 JSON
    const { appendFile } = await import('node:fs/promises');
    await appendFile(logPath, 'this is not json\n', 'utf-8');
    const result = await readRecentSessions();
    expect(result.map((e) => e.sessionId)).toEqual(['ok']);
  });
});

describe('loadSessionEntry', () => {
  it('returns null for unknown session', async () => {
    expect(await loadSessionEntry('nope')).toBeNull();
  });

  it('returns latest merged snapshot for a sessionId', async () => {
    await appendSessionLog(
      baseEntry({ sessionId: 's', totalCostUsd: 0.1, finishReason: undefined }),
    );
    await appendSessionLog(baseEntry({ sessionId: 's', totalCostUsd: 0.3 }));
    const entry = await loadSessionEntry('s');
    expect(entry?.totalCostUsd).toBeCloseTo(0.3);
    expect(entry?.finishReason).toBe('agent_done');
  });
});

describe('sealOrphanedSessions', () => {
  it('is a no-op when no orphans exist', async () => {
    await appendSessionLog(baseEntry({ sessionId: 'done' }));
    const sealed = await sealOrphanedSessions();
    expect(sealed).toEqual([]);
  });

  it('seals any session whose latest snapshot has undefined finishReason', async () => {
    await appendSessionLog(
      baseEntry({ sessionId: 'orphan', finishReason: undefined }),
    );
    await appendSessionLog(baseEntry({ sessionId: 'done' }));
    const sealed = await sealOrphanedSessions();
    expect(sealed).toEqual(['orphan']);
    const merged = await readRecentSessions();
    const orphan = merged.find((e) => e.sessionId === 'orphan');
    expect(orphan?.finishReason).toBe('error');
    expect(orphan?.ok).toBe(false);
    expect(orphan?.errorMessage).toBeTruthy();
  });
});

describe('compactSessionLog', () => {
  it('rewrites the file so only the latest snapshot per sessionId remains', async () => {
    await appendSessionLog(
      baseEntry({ sessionId: 'a', finishReason: undefined, totalCostUsd: 0 }),
    );
    await appendSessionLog(baseEntry({ sessionId: 'a', totalCostUsd: 1 }));
    await appendSessionLog(
      baseEntry({ sessionId: 'b', finishReason: undefined, totalCostUsd: 0 }),
    );
    await appendSessionLog(baseEntry({ sessionId: 'b', totalCostUsd: 2 }));

    const before = await readFile(logPath, 'utf-8');
    expect(before.split('\n').filter(Boolean)).toHaveLength(4);

    const result = await compactSessionLog();
    expect(result.rewrote).toBe(true);
    expect(result.entries).toBe(2);

    const after = await readFile(logPath, 'utf-8');
    expect(after.split('\n').filter(Boolean)).toHaveLength(2);

    const entries = await readRecentSessions();
    const byId = new Map(entries.map((e) => [e.sessionId, e]));
    expect(byId.get('a')?.totalCostUsd).toBeCloseTo(1);
    expect(byId.get('b')?.totalCostUsd).toBeCloseTo(2);
  });

  it('is a no-op when file is already canonical', async () => {
    await appendSessionLog(baseEntry({ sessionId: 'a' }));
    await appendSessionLog(baseEntry({ sessionId: 'b' }));
    const result = await compactSessionLog();
    expect(result.rewrote).toBe(false);
    expect(result.entries).toBe(2);
  });
});

describe('deleteSessionLog', () => {
  it('removes all records with the given sessionId', async () => {
    await appendSessionLog(
      baseEntry({ sessionId: 'keep', totalCostUsd: 0.5 }),
    );
    await appendSessionLog(
      baseEntry({ sessionId: 'remove', finishReason: undefined }),
    );
    await appendSessionLog(baseEntry({ sessionId: 'remove' }));

    await deleteSessionLog('remove');
    const entries = await readRecentSessions();
    expect(entries.map((e) => e.sessionId)).toEqual(['keep']);
  });
});
