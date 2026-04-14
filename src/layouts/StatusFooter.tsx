// 底部状态栏：显示 R 环境、最近 provider 与会话成本摘要。
import { useCallback, useEffect, useState } from 'react';

import type { SessionLogEntry } from '../../shared/runs';
import { aggregateSessionSummary } from '../features/chat/SessionSummaryBar';

export default function StatusFooter() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);

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

  const summary = aggregateSessionSummary(sessions);
  const latest = sessions[0];

  return (
    <footer className="flex h-[36px] items-center gap-4 border-t border-border bg-app px-6 text-[11px] font-mono text-fg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
          {/* TODO: 待 main 进程补上 rEnv.check IPC 后接入真实状态。 */}
          <span>R 环境待接入</span>
        </span>
        <span>·</span>
        <span className="truncate">
          {latest ? `${latest.providerLabel ?? 'env'} · ${latest.model}` : '尚未建立会话'}
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
