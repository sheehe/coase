import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { RuntimeSnapshot } from '../../../shared/ipc';
import Button from '../../components/ui/Button';

interface RuntimeGateProps {
  children: ReactNode;
}

/**
 * 研究运行时（R + Python）未就绪时，盖掉正常 UI 走安装向导；就绪后透传 children。
 *
 * 状态机（和 agent/runtime/install.ts 的 RuntimeInstallState 对齐）：
 *   unknown        —— 等第一次 IPC 回放，短暂 loading
 *   not_installed  —— 欢迎页：说明 + "开始安装" 按钮
 *   installing     —— 进度页：滚动日志尾 + 当前阶段
 *   ready          —— 透传 children（正常 app）
 *   error          —— 错误页：详情 + "重试安装" 按钮
 *
 * 订阅由 preload 建立；onEvent 建立瞬间会回放一次当前 snapshot，不需要在这
 * 再 poll 一次。
 */
export default function RuntimeGate({ children }: RuntimeGateProps) {
  const { t } = useTranslation('chat');
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.coase.runtime.onEvent((next) => {
      setSnapshot(next);
    });
    return unsubscribe;
  }, []);

  const handleInstall = async () => {
    setInstallError(null);
    try {
      await window.coase.runtime.install();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    }
  };

  // 还没拿到首次 snapshot 时，别盖白屏——等一下即可。大概 <50ms。
  if (!snapshot) return null;

  if (snapshot.state === 'ready') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app/95 p-8 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <RuntimeGateBody
          snapshot={snapshot}
          onInstall={handleInstall}
          installError={installError}
          t={t}
        />
      </div>
    </div>
  );
}

function RuntimeGateBody({
  snapshot,
  onInstall,
  installError,
  t,
}: {
  snapshot: RuntimeSnapshot;
  onInstall: () => void;
  installError: string | null;
  t: TFunction<'chat'>;
}) {
  switch (snapshot.state) {
    case 'not_installed':
      return (
        <NotInstalledView
          rootDir={snapshot.rootDir}
          onInstall={onInstall}
          error={installError}
          t={t}
        />
      );
    case 'installing':
      return <InstallingView snapshot={snapshot} t={t} />;
    case 'error':
      return <ErrorView snapshot={snapshot} onRetry={onInstall} t={t} />;
    case 'unknown':
    default:
      return (
        <div className="p-8 text-center text-sm text-fg-muted">{t('runtime.detecting')}</div>
      );
  }
}

function NotInstalledView({
  rootDir,
  onInstall,
  error,
  t,
}: {
  rootDir: string;
  onInstall: () => void;
  error: string | null;
  t: TFunction<'chat'>;
}) {
  return (
    <div className="flex flex-col gap-5 p-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">{t('runtime.installTitle')}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t('runtime.installDesc')}</p>
      </div>

      <ul className="space-y-1.5 rounded-xl border border-border bg-app px-4 py-3 text-xs text-fg-muted">
        <li>• {t('runtime.bullets.downloadSize')}</li>
        <li>• {t('runtime.bullets.isolation')}</li>
        <li>
          • {t('runtime.bullets.rootDir')}
          <code className="rounded bg-black/[0.04] px-1 py-0.5 text-[11px]">{rootDir}</code>
        </li>
        <li>• {t('runtime.bullets.duration')}</li>
      </ul>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onInstall}>{t('runtime.startInstall')}</Button>
      </div>
    </div>
  );
}

function InstallingView({ snapshot, t }: { snapshot: RuntimeSnapshot; t: TFunction<'chat'> }) {
  const logsRef = useRef<HTMLDivElement | null>(null);
  const logs = snapshot.logsTail;

  // 日志尾自动滚到底——用户要看的是"最新在发生什么"，不是"最早发生了什么"。
  useEffect(() => {
    const el = logsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="flex min-h-0 flex-col gap-4 p-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">{t('runtime.installingTitle')}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          {snapshot.message ?? t('runtime.installingFallback')}
        </p>
      </div>

      <div
        ref={logsRef}
        className="min-h-[180px] flex-1 overflow-y-auto rounded-xl border border-border bg-black/[0.02] px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted"
      >
        {logs.length === 0 ? (
          <div className="text-fg-subtle">{t('runtime.logsEmpty')}</div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-fg-subtle">{t('runtime.installNote')}</p>
    </div>
  );
}

function ErrorView({
  snapshot,
  onRetry,
  t,
}: {
  snapshot: RuntimeSnapshot;
  onRetry: () => void;
  t: TFunction<'chat'>;
}) {
  const detail = useMemo(() => snapshot.errorDetail?.trim() ?? '', [snapshot.errorDetail]);
  return (
    <div className="flex min-h-0 flex-col gap-4 p-8">
      <div>
        <h2 className="text-lg font-semibold text-danger">{t('runtime.errorTitle')}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {snapshot.message ?? t('runtime.errorFallback')}
        </p>
      </div>

      {detail && (
        <pre className="max-h-64 overflow-auto rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-danger/90">
          {detail}
        </pre>
      )}

      {snapshot.logsTail.length > 0 && (
        <details className="rounded-xl border border-border bg-app px-3 py-2 text-[11px] text-fg-muted">
          <summary className="cursor-pointer select-none text-fg">
            {t('runtime.logsExpand', { count: snapshot.logsTail.length })}
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto font-mono leading-relaxed">
            {snapshot.logsTail.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onRetry}>{t('runtime.retryInstall')}</Button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent"
    />
  );
}
