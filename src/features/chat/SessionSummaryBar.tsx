import { useCallback, useEffect, useState } from 'react';

import type { SessionLogEntry } from '../../../shared/runs';

export function aggregateSessionSummary(sessions: SessionLogEntry[]) {
  const today = todayKey();
  const todaySessions = sessions.filter((s) => dateKey(s.startedAt) === today);

  return {
    todayCount: todaySessions.length,
    todayCost: sumCost(todaySessions),
    totalCount: sessions.length,
    totalCost: sumCost(sessions),
    last: sessions[0] ?? null,
  };
}

export default function SessionSummaryBar({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const recent = await window.coase.sessions.recent(200);
      setSessions(recent);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error) {
    return <div className="text-sm text-danger">会话历史读取失败：{error}</div>;
  }

  if (sessions.length === 0) {
    return <div className="text-sm text-fg-subtle">暂无会话历史</div>;
  }

  const summary = aggregateSessionSummary(sessions);

  return (
    <div className="flex items-center gap-3 text-sm text-fg-muted">
      <span>今日 {summary.todayCount} 次</span>
      <span>·</span>
      <span>${summary.todayCost.toFixed(4)}</span>
      <span>·</span>
      <span>累计 {summary.totalCount} 次</span>
      <span>·</span>
      <span>${summary.totalCost.toFixed(4)}</span>
    </div>
  );
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function todayKey(): string {
  return dateKey(Date.now());
}

function sumCost(entries: SessionLogEntry[]): number {
  return entries.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0);
}
