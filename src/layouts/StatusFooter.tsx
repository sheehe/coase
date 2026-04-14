// 底部状态栏：显示 R 环境、最近 provider 与会话成本摘要。
import { useCallback, useEffect, useState } from 'react';

import type { REnvStatus } from '../../shared/ipc';
import type { SessionLogEntry } from '../../shared/runs';
import { useChat } from '../features/chat/ChatContext';
import { aggregateSessionSummary } from '../features/chat/SessionSummaryBar';

export default function StatusFooter() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [rEnv, setREnv] = useState<REnvStatus | null>(null);
  const [rChecking, setRChecking] = useState(true);
  const { latestProvider, latestTurnMetrics } = useChat();

  const load = useCallback(async () => {
    try {
      const recent = await window.coase.sessions.recent(200);
      setSessions(recent);
    } catch (err) {
      console.error('load footer sessions failed', err);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await window.coase.rEnv.check();
        if (!cancelled) setREnv(status);
      } catch (err) {
        if (!cancelled) {
          setREnv({
            available: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (!cancelled) setRChecking(false);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = aggregateSessionSummary(sessions);
  const rVersion = rEnv?.version?.match(/(\d+\.\d+\.\d+)/)?.[1];
  const rDotClass = rChecking ? 'bg-border-strong' : rEnv?.available ? 'bg-success' : 'bg-danger';
  const rLabel = rChecking
    ? 'R 检测中…'
    : rEnv?.available
      ? `R · ${rVersion ?? rEnv.version ?? '已连接'}`
      : 'R 未检测';
  const rTitle = rEnv?.available ? rEnv.path : rEnv?.error;

  return (
    <footer className="flex h-[36px] items-center gap-4 border-t border-border bg-app px-6 text-[11px] font-mono text-fg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex items-center gap-1.5" title={rTitle}>
          <span className={`h-1.5 w-1.5 rounded-full ${rDotClass}`} />
          <span>{rLabel}</span>
        </span>
        <span>·</span>
        <span className="truncate">
          {latestProvider ? `${latestProvider.label} · ${latestProvider.model}` : '尚未建立会话'}
        </span>
        <span>·</span>
        <span>
          本次会话{' '}
          {latestTurnMetrics?.costUsd != null
            ? `$${latestTurnMetrics.costUsd.toFixed(4)}`
            : '$0.0000'}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
        <span>今日 {summary.todayCount} 次</span>
        <span>·</span>
        <span>${summary.todayCost.toFixed(4)}</span>
        <span>·</span>
        <span>累计 {summary.totalCount} 次</span>
        <span>·</span>
        <span>${summary.totalCost.toFixed(4)}</span>
      </div>
    </footer>
  );
}
