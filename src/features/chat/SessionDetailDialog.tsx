// 会话详情弹窗：展示历史会话的元数据、只读回放、产物，并支持继续研究。
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { RunInsightsPersisted, TranscriptEntryPersisted } from '../../../shared/ipc';
import type { SessionLogEntry } from '../../../shared/runs';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import ArtifactPreviewDialog from './ArtifactPreviewDialog';
import { useChat } from './ChatContext';
import TranscriptMessage from './TranscriptMessage';
import { deriveRunInsights } from './run-insights';

type TabKey = 'meta' | 'log' | 'artifacts';

export default function SessionDetailDialog({
  session,
  onClose,
}: {
  session: SessionLogEntry | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('chat');
  const navigate = useNavigate();
  const { resumeHistoricalSession } = useChat();
  const [tab, setTab] = useState<TabKey>('meta');
  const [entries, setEntries] = useState<TranscriptEntryPersisted[]>([]);
  const [storedInsights, setStoredInsights] = useState<RunInsightsPersisted | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const insights = useMemo(
    () => storedInsights ?? deriveRunInsights(entries),
    [storedInsights, entries],
  );
  const selectedArtifact =
    insights.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;

  useEffect(() => {
    if (!session) {
      setTab('meta');
      setEntries([]);
      setStoredInsights(null);
      setSelectedArtifactId(null);
      setResuming(false);
      return;
    }

    let cancelled = false;
    setTab('meta');
    setEntries([]);
    setStoredInsights(null);
    setSelectedArtifactId(null);
    setResuming(false);

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

    void window.coase.sessions
      .insights(session.sessionId)
      .then((nextInsights) => {
        if (!cancelled) {
          setStoredInsights(nextInsights);
        }
      })
      .catch((error) => {
        console.warn('failed to load session insights', {
          sessionId: session.sessionId,
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';
  const dash = t('sessionDetail.meta.dash');

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {session?.sdkSessionId && (
        <Button
          onClick={() => {
            if (!session || resuming) return;
            setResuming(true);
            void resumeHistoricalSession(session)
              .then(() => {
                onClose();
                navigate('/chat');
              })
              .catch((error) => {
                console.warn('failed to resume historical session', {
                  sessionId: session.sessionId,
                  error,
                });
              })
              .finally(() => {
                setResuming(false);
              });
          }}
        >
          {resuming ? t('sessionDetail.actions.resuming') : t('sessionDetail.actions.resume')}
        </Button>
      )}
      <Button onClick={onClose}>{t('sessionDetail.actions.close')}</Button>
    </div>
  );

  return (
    <Dialog
      open={session !== null}
      onClose={onClose}
      title={session?.firstPrompt ?? t('sessionDetail.title')}
      footer={footer}
      widthClass="max-w-4xl"
    >
      {session && (
        <div className="space-y-5">
          <div className="inline-flex rounded-xl border border-border bg-app p-1">
            <TabButton active={tab === 'meta'} onClick={() => setTab('meta')}>
              {t('sessionDetail.tabs.meta')}
            </TabButton>
            <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
              {t('sessionDetail.tabs.log')}
            </TabButton>
            <TabButton active={tab === 'artifacts'} onClick={() => setTab('artifacts')}>
              {t('sessionDetail.tabs.artifacts')}
            </TabButton>
          </div>

          {tab === 'meta' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-app p-4 text-sm leading-relaxed text-fg">
                {session.firstPrompt}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetaItem
                  label={t('sessionDetail.meta.startedAt')}
                  value={formatDateTime(session.startedAt, locale, dash)}
                />
                <MetaItem
                  label={t('sessionDetail.meta.endedAt')}
                  value={formatDateTime(session.endedAt, locale, dash)}
                />
                <MetaItem
                  label={t('sessionDetail.meta.duration')}
                  value={formatDuration(session.totalDurationMs)}
                />
                <MetaItem
                  label={t('sessionDetail.meta.userMessages')}
                  value={String(session.userMessageCount)}
                />
                <MetaItem
                  label={t('sessionDetail.meta.agentTurns')}
                  value={String(session.agentTurnCount)}
                />
                <MetaItem
                  label={t('sessionDetail.meta.provider')}
                  value={session.providerLabel ?? t('sessionDetail.meta.providerFallback')}
                />
                <MetaItem label={t('sessionDetail.meta.model')} value={session.model} />
                <MetaItem
                  label={t('sessionDetail.meta.baseURL')}
                  value={session.baseURL ?? dash}
                />
                <MetaItem
                  label={t('sessionDetail.meta.totalCost')}
                  value={`$${session.totalCostUsd.toFixed(4)}`}
                />
                <MetaItem
                  label={t('sessionDetail.meta.totalTokens')}
                  value={
                    typeof session.totalTokens === 'number'
                      ? session.totalTokens.toLocaleString(locale)
                      : dash
                  }
                />
                <MetaItem
                  label={t('sessionDetail.meta.sdkSessionId')}
                  value={session.sdkSessionId ?? dash}
                />
                <MetaItem
                  label={t('sessionDetail.meta.result')}
                  value={renderSessionResult(session, t)}
                />
              </div>
            </div>
          ) : tab === 'log' ? (
            <div className="rounded-2xl border border-border bg-surface p-3">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-app px-4 py-10 text-center text-sm text-fg-muted">
                  {t('sessionDetail.log.empty')}
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-1 py-2">
                    {entries.map((entry, index) => (
                      <TranscriptMessage key={`${entry.kind}-${entry.ts}-${index}`} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
                    {t('sessionDetail.artifacts.milestones')}
                  </div>
                  <div className="text-[11px] text-fg-subtle">{insights.milestones.length}</div>
                </div>
                {insights.milestones.length === 0 ? (
                  <EmptyState text={t('sessionDetail.artifacts.noMilestones')} />
                ) : (
                  <div className="space-y-2">
                    {insights.milestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="rounded-2xl border border-border bg-app px-3 py-3"
                      >
                        <div className="text-sm text-fg">{milestone.label}</div>
                        <div className="mt-1 text-[11px] text-fg-subtle">
                          {formatDateTime(milestone.ts, locale, dash)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
                    {t('sessionDetail.artifacts.artifactsLabel')}
                  </div>
                  <div className="text-[11px] text-fg-subtle">{insights.artifacts.length}</div>
                </div>
                {insights.artifacts.length === 0 ? (
                  <EmptyState text={t('sessionDetail.artifacts.noArtifacts')} />
                ) : (
                  <div className="space-y-2">
                    {insights.artifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        type="button"
                        onClick={() => setSelectedArtifactId(artifact.id)}
                        className="block w-full rounded-2xl border border-border bg-app px-3 py-3 text-left transition hover:border-border-strong"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-fg">{artifact.title}</div>
                          <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                            {artifact.kind}
                          </div>
                        </div>
                        <div className="mt-2 text-[12px] leading-relaxed text-fg-muted">
                          {artifact.contentPreview}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-fg-subtle">
            {session.sdkSessionId
              ? t('sessionDetail.footerHint.resumable')
              : t('sessionDetail.footerHint.readOnly')}
          </div>
        </div>
      )}

      <ArtifactPreviewDialog
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifactId(null)}
      />
    </Dialog>
  );
}

function renderSessionResult(
  session: SessionLogEntry,
  t: ReturnType<typeof useTranslation>['t'],
): ReactNode {
  if (session.finishReason === 'user_interrupt') {
    return <span className="text-fg">{t('sessionDetail.result.interrupt')}</span>;
  }
  if (session.finishReason === 'user_cancel') {
    return <span className="text-fg-muted">{t('sessionDetail.result.cancel')}</span>;
  }
  if (session.ok) {
    return <span className="text-success">{t('sessionDetail.result.success')}</span>;
  }
  return (
    <span className="text-danger">
      {session.errorMessage
        ? t('sessionDetail.result.failedWithDetail', { message: session.errorMessage })
        : t('sessionDetail.result.failed')}
    </span>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-app px-4 py-10 text-center text-sm text-fg-muted">
      {text}
    </div>
  );
}

function formatDateTime(ts: number | undefined, locale: string, dash: string): string {
  if (!ts) return dash;
  return new Date(ts).toLocaleString(locale, { hour12: false });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}
