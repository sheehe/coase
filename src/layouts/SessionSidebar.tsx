// 会话侧边栏：展示品牌、会话历史与设置入口。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { AlertCircle, Plus, RefreshCw, Settings, Wrench } from '../components/Icons';
import SessionDetailDialog from '../features/chat/SessionDetailDialog';
import { useChat } from '../features/chat/ChatContext';
import type { SessionLogEntry } from '../../shared/runs';

type SessionGroup = {
  title: string;
  entries: SessionLogEntry[];
};

export default function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionLogEntry | null>(null);
  const { onNewSession, chatState } = useChat();

  const loadSessions = useCallback(async () => {
    try {
      const recent = await window.coase.sessions.recent(100);
      setSessions(recent);
    } catch (err) {
      console.error('load sessions failed', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <>
      <aside className="flex h-screen w-[272px] shrink-0 flex-col bg-sidebar">
        <div className="px-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="h-[18px] w-[18px] rounded-md bg-accent" />
            <span className="text-[15px] font-semibold tracking-tight text-fg">Coase</span>
            <span className="ml-auto text-[10px] text-fg-subtle">v2 alpha</span>
          </div>
          <button
            type="button"
            onClick={() => void onNewSession()}
            disabled={chatState === 'running'}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm text-fg transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:text-fg-subtle dark:hover:bg-white/[0.04]"
          >
            <Plus size={15} />
            <span>新会话</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center px-4 pb-2 pt-6">
            <span className="text-[11px] uppercase tracking-wider text-fg-subtle">会话历史</span>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="ml-auto rounded-lg p-1 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
              aria-label="刷新会话历史"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-fg-subtle">加载中…</div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-fg-subtle">
              还没有会话 · 从右侧开始
            </div>
          ) : (
            <div className="space-y-5 pb-6">
              {groups.map((group) => (
                <section key={group.title}>
                  <div className="px-4 pb-2 text-[11px] uppercase tracking-wider text-fg-subtle">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.entries.map((entry) => (
                      <button
                        key={entry.sessionId}
                        type="button"
                        onClick={() => setSelected(entry)}
                        className="mx-2 flex w-[calc(100%-1rem)] flex-col rounded-lg px-4 py-2.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                      >
                        <span className="line-clamp-1 text-[13px] text-fg">
                          {entry.firstPrompt.slice(0, 48)}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                          <span>{formatClock(entry.startedAt)}</span>
                          <span>·</span>
                          <span>{entry.providerLabel ?? 'env'}</span>
                          <span>·</span>
                          <span>${entry.totalCostUsd.toFixed(4)}</span>
                          {!entry.ok && <AlertCircle size={10} className="text-danger" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-2 pb-4 pt-3">
          <SidebarMenuLink to="/settings" icon={<Wrench size={15} />} label="技能与模型" />
          <SidebarMenuLink to="/settings" icon={<Settings size={15} />} label="设置" />
        </div>
      </aside>

      <SessionDetailDialog session={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SidebarMenuLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function groupSessions(entries: SessionLogEntry[]): SessionGroup[] {
  const today: SessionLogEntry[] = [];
  const yesterday: SessionLogEntry[] = [];
  const earlier: SessionLogEntry[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (entry.startedAt >= todayStart) today.push(entry);
    else if (entry.startedAt >= yesterdayStart) yesterday.push(entry);
    else earlier.push(entry);
  }

  return [
    { title: '今天', entries: today },
    { title: '昨天', entries: yesterday },
    { title: '更早', entries: earlier },
  ].filter((group) => group.entries.length > 0);
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
