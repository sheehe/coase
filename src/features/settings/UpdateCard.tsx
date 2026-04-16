import { useEffect, useMemo, useState } from 'react';

import type { AppUpdateSnapshot } from '../../../shared/ipc';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';

const INITIAL_STATE: AppUpdateSnapshot = {
  supported: false,
  enabled: false,
  status: 'disabled',
  currentVersion: 'unknown',
  canCheck: false,
  canDownload: false,
  canInstall: false,
  message: '正在读取更新状态',
};

export default function UpdateCard() {
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot>(INITIAL_STATE);
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
            ...INITIAL_STATE,
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
  }, []);

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
          <div className="text-[19px] font-semibold tracking-[-0.02em] text-fg">应用更新</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-6 text-fg-muted">
            <span>当前版本 {snapshot.currentVersion}</span>
            {snapshot.provider && <span>{snapshot.provider}</span>}
          </div>
        </div>

        <Badge tone={statusTone}>{labelForStatus(snapshot.status)}</Badge>
      </CardBody>

      <CardBody className="space-y-4 px-5 py-4">
        <div className="space-y-1.5 text-[13px] leading-6 text-fg-muted">
          <p>{snapshot.message ?? '未开始检查更新'}</p>

          {snapshot.availableVersion && (
            <p>
              可用版本 <span className="font-mono text-fg">{snapshot.availableVersion}</span>
            </p>
          )}

          {typeof snapshot.progressPercent === 'number' && (
            <p>
              下载进度 <span className="font-mono text-fg">{snapshot.progressPercent.toFixed(1)}%</span>
              {snapshot.totalBytes
                ? ` · ${formatBytes(snapshot.transferredBytes ?? 0)} / ${formatBytes(snapshot.totalBytes)}`
                : ''}
            </p>
          )}

          {snapshot.updateInfoUrl && (
            <a
              href={snapshot.updateInfoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[13px] text-fg underline underline-offset-2"
            >
              查看发行说明
            </a>
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
            {pendingAction === 'check' ? '检查中…' : '检查更新'}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleDownload()}
            disabled={!snapshot.canDownload || pendingAction !== null}
            className="rounded-full px-3.5"
          >
            {pendingAction === 'download' ? '下载中…' : '下载更新'}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleInstall()}
            disabled={!snapshot.canInstall || pendingAction !== null}
            className="rounded-full px-3.5"
          >
            {pendingAction === 'install' ? '准备重启…' : '重启并安装'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function labelForStatus(status: AppUpdateSnapshot['status']): string {
  switch (status) {
    case 'disabled':
      return '未启用';
    case 'idle':
      return '就绪';
    case 'checking':
      return '检查中';
    case 'available':
      return '可更新';
    case 'not-available':
      return '最新';
    case 'downloading':
      return '下载中';
    case 'downloaded':
      return '可安装';
    case 'error':
      return '错误';
    default:
      return status;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
