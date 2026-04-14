// 会话详情弹窗：展示历史会话的元数据与只读对话回放。
import { useEffect, useState, type ReactNode } from 'react';

import type { TranscriptEntryPersisted } from '../../../shared/ipc';
import type { SessionLogEntry } from '../../../shared/runs';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import TranscriptMessage from './TranscriptMessage';

type TabKey = 'meta' | 'log';

export default function SessionDetailDialog({
  session,
  onClose,
}: {
  session: SessionLogEntry | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('meta');
  const [entries, setEntries] = useState<TranscriptEntryPersisted[]>([]);

  useEffect(() => {
    if (!session) {
      setTab('meta');
      setEntries([]);
      return;
    }

    let cancelled = false;
    setTab('meta');
    setEntries([]);

    void window.coase.sessions
      .transcript(session.sessionId)
      .then((nextEntries) => {
        if (!cancelled) {
          setEntries(nextEntries);
        }
      })
      .catch((error) => {
        console.warn('failed to load session transcript', {
          sessionId: session.sessionId,
          error,
        });
        if (!cancelled) {
          setEntries([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <Dialog
      open={session !== null}
      onClose={onClose}
      title={session?.firstPrompt ?? '会话详情'}
      footer={<Button onClick={onClose}>关闭</Button>}
      widthClass="max-w-3xl"
    >
      {session && (
        <div className="space-y-5">
          <div className="inline-flex rounded-xl border border-border bg-app p-1">
            <TabButton active={tab === 'meta'} onClick={() => setTab('meta')}>
              元数据
            </TabButton>
            <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
              对话记录
            </TabButton>
          </div>

          {tab === 'meta' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-app p-4 text-sm leading-relaxed text-fg">
                {session.firstPrompt}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetaItem label="开始时间" value={formatDateTime(session.startedAt)} />
                <MetaItem label="结束时间" value={formatDateTime(session.endedAt)} />
                <MetaItem label="时长" value={formatDuration(session.totalDurationMs)} />
                <MetaItem label="用户消息数" value={String(session.userMessageCount)} />
                <MetaItem label="agent turns" value={String(session.agentTurnCount)} />
                <MetaItem label="provider" value={session.providerLabel ?? 'env'} />
                <MetaItem label="model" value={session.model} />
                <MetaItem label="baseURL" value={session.baseURL ?? '—'} />
                <MetaItem label="累计成本" value={`$${session.totalCostUsd.toFixed(4)}`} />
                <MetaItem
                  label="结果"
                  value={
                    session.ok ? (
                      <span className="text-success">成功</span>
                    ) : (
                      <span className="text-danger">
                        失败{session.errorMessage ? ` · ${session.errorMessage}` : ''}
                      </span>
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-3">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-app px-4 py-10 text-center text-sm text-fg-muted">
                  该会话未持久化对话记录（旧会话或系统异常）
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-1 py-2">
                    {entries.map((entry, index) => (
                      <TranscriptMessage
                        key={`${entry.kind}-${entry.ts}-${index}`}
                        entry={entry}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-fg-subtle">只读回放；继续会话功能将在后续版本提供</div>
        </div>
      )}
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-lg px-3 py-1.5 text-sm transition',
        active
          ? 'bg-surface text-fg'
          : 'text-fg-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-2 break-all text-sm text-fg">{value}</div>
    </div>
  );
}

function formatDateTime(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}
