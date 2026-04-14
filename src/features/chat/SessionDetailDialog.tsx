// 会话详情弹窗：只读展示一条历史会话的关键元数据。
import type { ReactNode } from 'react';

import Dialog from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import type { SessionLogEntry } from '../../../shared/runs';

export default function SessionDetailDialog({
  session,
  onClose,
}: {
  session: SessionLogEntry | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={session !== null}
      onClose={onClose}
      title={session?.firstPrompt ?? '会话详情'}
      footer={<Button onClick={onClose}>关闭</Button>}
      widthClass="max-w-2xl"
    >
      {session && (
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

          <div className="text-xs text-fg-subtle">会话回放与继续功能将在后续版本提供</div>
        </div>
      )}
    </Dialog>
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

function formatDateTime(ts: number): string {
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
