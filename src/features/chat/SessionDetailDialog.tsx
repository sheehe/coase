// 浼氳瘽璇︽儏寮圭獥锛氬睍绀哄巻鍙蹭細璇濈殑鍏冩暟鎹€佸彧璇诲洖鏀俱€佷骇鐗╋紝骞舵敮鎸佺户缁爺绌躲€?
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
          {resuming ? '缁х画涓€?' : '缁х画鐮旂┒'}
        </Button>
      )}
      <Button onClick={onClose}>鍏抽棴</Button>
    </div>
  );

  return (
    <Dialog
      open={session !== null}
      onClose={onClose}
      title={session?.firstPrompt ?? '浼氳瘽璇︽儏'}
      footer={footer}
      widthClass="max-w-4xl"
    >
      {session && (
        <div className="space-y-5">
          <div className="inline-flex rounded-xl border border-border bg-app p-1">
            <TabButton active={tab === 'meta'} onClick={() => setTab('meta')}>
              鍏冩暟鎹?
            </TabButton>
            <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
              瀵硅瘽璁板綍
            </TabButton>
            <TabButton active={tab === 'artifacts'} onClick={() => setTab('artifacts')}>
              浜х墿涓庨噷绋嬬
            </TabButton>
          </div>

          {tab === 'meta' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-app p-4 text-sm leading-relaxed text-fg">
                {session.firstPrompt}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetaItem label="寮€濮嬫椂闂?" value={formatDateTime(session.startedAt)} />
                <MetaItem label="缁撴潫鏃堕棿" value={formatDateTime(session.endedAt)} />
                <MetaItem label="鏃堕暱" value={formatDuration(session.totalDurationMs)} />
                <MetaItem label="鐢ㄦ埛娑堟伅鏁?" value={String(session.userMessageCount)} />
                <MetaItem label="浠ｇ悊杞" value={String(session.agentTurnCount)} />
                <MetaItem label="鏈嶅姟鎻愪緵鏂?" value={session.providerLabel ?? '鐜鍙橀噺'} />
                <MetaItem label="妯″瀷" value={session.model} />
                <MetaItem label="鎺ュ彛鍦板潃" value={session.baseURL ?? '鈥?'} />
                <MetaItem label="绱鎴愭湰" value={`$${session.totalCostUsd.toFixed(4)}`} />
                <MetaItem
                  label="绱 Token"
                  value={
                    typeof session.totalTokens === 'number'
                      ? session.totalTokens.toLocaleString('zh-CN')
                      : '鈥?'
                  }
                />
                <MetaItem label="Claude 浼氳瘽 ID" value={session.sdkSessionId ?? '鈥?'} />
                <MetaItem label="缁撴灉" value={renderSessionResult(session)} />
              </div>
            </div>
          ) : tab === 'log' ? (
            <div className="rounded-2xl border border-border bg-surface p-3">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-app px-4 py-10 text-center text-sm text-fg-muted">
                  璇ヤ細璇濇湭鎸佷箙鍖栧璇濊褰曪紙鏃т細璇濇垨绯荤粺寮傚父锛?
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
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle">閲岀▼纰?</div>
                  <div className="text-[11px] text-fg-subtle">{insights.milestones.length}</div>
                </div>
                {insights.milestones.length === 0 ? (
                  <EmptyState text="褰撳墠娌℃湁鍙洖鏀剧殑閲岀▼纰?" />
                ) : (
                  <div className="space-y-2">
                    {insights.milestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="rounded-2xl border border-border bg-app px-3 py-3"
                      >
                        <div className="text-sm text-fg">{milestone.label}</div>
                        <div className="mt-1 text-[11px] text-fg-subtle">
                          {formatDateTime(milestone.ts)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle">浜х墿</div>
                  <div className="text-[11px] text-fg-subtle">{insights.artifacts.length}</div>
                </div>
                {insights.artifacts.length === 0 ? (
                  <EmptyState text="褰撳墠娌℃湁鍙洖鏀剧殑鎺ㄥ浜х墿" />
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
              ? '鐐瑰嚮鈥滅户缁爺绌垛€濆悗锛屽皢鍥炲埌褰撳墠鑱婂ぉ椤碉紝骞跺熀浜?Claude 鍘熺敓浼氳瘽缁х画銆?'
              : '璇ュ巻鍙蹭細璇濈己灏戝彲鎭㈠鐨?Claude 鍘熺敓浼氳瘽 ID锛岀洰鍓嶄粎鏀寔鍙鍥炴斁銆?'}
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

function renderSessionResult(session: SessionLogEntry): ReactNode {
  if (session.finishReason === 'user_interrupt') {
    return <span className="text-fg">宸叉殏鍋滐紝鍙户缁爺绌?</span>;
  }
  if (session.finishReason === 'user_cancel') {
    return <span className="text-fg-muted">宸茬粓姝?</span>;
  }
  if (session.ok) {
    return <span className="text-success">鎴愬姛</span>;
  }
  return (
    <span className="text-danger">
      澶辫触{session.errorMessage ? ` 路 ${session.errorMessage}` : ''}
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

function formatDateTime(ts: number | undefined): string {
  if (!ts) return '鈥?';
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
