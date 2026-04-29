import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppUpdateSnapshot } from '../../../shared/ipc';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';

function buildInitialState(t: (key: string) => string): AppUpdateSnapshot {
  return {
    supported: false,
    enabled: false,
    status: 'disabled',
    currentVersion: 'unknown',
    canCheck: false,
    canDownload: false,
    canInstall: false,
    message: t('updates.messages.initial'),
  };
}

export default function UpdateCard() {
  const { t } = useTranslation('settings');
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot>(() => buildInitialState(t));
  const [pendingAction, setPendingAction] = useState<'check' | 'download' | 'install' | null>(null);

  useEffect(() => {
    let mounted = true;
    void window.coase.updates
      .getState()
      .then((next) => {
        if (mounted) setSnapshot(next);
      })
      .catch((error) => {
        if (mounted) {
          setSnapshot({
            ...buildInitialState(t),
            message: error instanceof Error ? error.message : String(error),
            status: 'error',
          });
        }
      });

    const unsubscribe = window.coase.updates.onEvent((next) => {
      if (!mounted) return;
      setSnapshot(next);
      if (next.status !== 'checking' && next.status !== 'downloading') {
        setPendingAction(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [t]);

  const statusTone = useMemo(() => {
    switch (snapshot.status) {
      case 'available':
      case 'downloaded':
        return 'emerald' as const;
      case 'error':
        return 'rose' as const;
      case 'checking':
      case 'downloading':
        return 'amber' as const;
      default:
        return 'neutral' as const;
    }
  }, [snapshot.status]);

  const handleCheck = async () => {
    setPendingAction('check');
    try {
      await window.coase.updates.check();
    } catch (error) {
      setPendingAction(null);
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const handleDownload = async () => {
    setPendingAction('download');
    try {
      await window.coase.updates.download();
    } catch (error) {
      setPendingAction(null);
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const handleInstall = async () => {
    setPendingAction('install');
    try {
      await window.coase.updates.install();
    } catch (error) {
      setPendingAction(null);
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
            {t('updates.title')}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-fg-muted">
            {t('updates.currentVersion', { version: snapshot.currentVersion })}
          </div>
        </div>

        <Badge tone={statusTone}>{t(`updates.status.${snapshot.status}`)}</Badge>
      </CardBody>

      <CardBody className="space-y-4 px-5 py-4">
        <div className="space-y-1.5 text-[13px] leading-6 text-fg-muted">
          <p>{snapshot.message ?? t('updates.messages.idle')}</p>

          {snapshot.availableVersion && (
            <p>
              {t('updates.messages.availableVersion')}{' '}
              <span className="font-mono text-fg">{snapshot.availableVersion}</span>
            </p>
          )}

          {typeof snapshot.progressPercent === 'number' && (
            <p>
              {t('updates.messages.downloadProgress')}{' '}
              <span className="font-mono text-fg">{snapshot.progressPercent.toFixed(1)}%</span>
              {snapshot.totalBytes
                ? ` · ${formatBytes(snapshot.transferredBytes ?? 0)} / ${formatBytes(snapshot.totalBytes)}`
                : ''}
            </p>
          )}

          {(snapshot.status === 'disabled' ||
            (snapshot.status === 'error' && snapshot.updateInfoUrl)) && (
            <p>
              <a
                href={snapshot.updateInfoUrl ?? 'https://github.com/sheehe/coase/releases/latest'}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {t('updates.messages.manualLink')}
              </a>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleCheck()}
            disabled={!snapshot.canCheck || pendingAction !== null}
            className="rounded-full px-3.5"
          >
            {pendingAction === 'check' ? t('updates.actions.checking') : t('updates.actions.check')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleDownload()}
            disabled={!snapshot.canDownload || pendingAction !== null}
            className="rounded-full px-3.5"
          >
            {pendingAction === 'download'
              ? t('updates.actions.downloading')
              : t('updates.actions.download')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleInstall()}
            disabled={!snapshot.canInstall || pendingAction !== null}
            className="rounded-full px-3.5"
          >
            {pendingAction === 'install'
              ? t('updates.actions.installing')
              : t('updates.actions.install')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
