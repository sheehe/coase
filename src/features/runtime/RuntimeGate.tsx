import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
        />
      </div>
    </div>
  );
}

function RuntimeGateBody({
  snapshot,
  onInstall,
  installError,
}: {
  snapshot: RuntimeSnapshot;
  onInstall: () => void;
  installError: string | null;
}) {
  switch (snapshot.state) {
    case 'not_installed':
      return (
        <NotInstalledView rootDir={snapshot.rootDir} onInstall={onInstall} error={installError} />
      );
    case 'installing':
      return <InstallingView snapshot={snapshot} />;
    case 'error':
      return <ErrorView snapshot={snapshot} onRetry={onInstall} />;
    case 'unknown':
    default:
      return (
        <div className="p-8 text-center text-sm text-fg-muted">
          正在检测研究环境…
        </div>
      );
  }
}

function NotInstalledView({
  rootDir,
  onInstall,
  error,
}: {
  rootDir: string;
  onInstall: () => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-5 p-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">首次启动：安装研究环境</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Coase 内置了一套独立的 R + Python 计量研究环境（fixest / plm / statsmodels /
          linearmodels 等），与你电脑上已有的 R 或 Python 完全隔离。
        </p>
      </div>

      <ul className="space-y-1.5 rounded-xl border border-border bg-app px-4 py-3 text-xs text-fg-muted">
        <li>• 安装过程会从 conda-forge 下载并解包，约 1.5–3 GB，需要联网</li>
        <li>• 装好后所有 agent 子进程会自动使用这套 R / Python，不再依赖系统 PATH</li>
        <li>• 目录：<code className="rounded bg-black/[0.04] px-1 py-0.5 text-[11px]">{rootDir}</code></li>
        <li>• 第一次可能要 5–15 分钟，下次启动只做 fs 检测，瞬间过</li>
      </ul>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onInstall}>开始安装</Button>
      </div>
    </div>
  );
}

function InstallingView({ snapshot }: { snapshot: RuntimeSnapshot }) {
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
        <h2 className="text-lg font-semibold text-fg">正在安装研究环境</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          {snapshot.message ?? 'pixi install 进行中…'}
        </p>
      </div>

      <div
        ref={logsRef}
        className="min-h-[180px] flex-1 overflow-y-auto rounded-xl border border-border bg-black/[0.02] px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted"
      >
        {logs.length === 0 ? (
          <div className="text-fg-subtle">（尚无输出，pixi 正在解析依赖…）</div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-fg-subtle">
        这个过程只在首次启动发生一次。你可以最小化窗口去做别的事——装完会自动进入主界面。
      </p>
    </div>
  );
}

function ErrorView({
  snapshot,
  onRetry,
}: {
  snapshot: RuntimeSnapshot;
  onRetry: () => void;
}) {
  const detail = useMemo(() => snapshot.errorDetail?.trim() ?? '', [snapshot.errorDetail]);
  return (
    <div className="flex min-h-0 flex-col gap-4 p-8">
      <div>
        <h2 className="text-lg font-semibold text-danger">安装失败</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {snapshot.message ?? '研究环境未能就绪。'}
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
            最近 {snapshot.logsTail.length} 行 pixi 输出
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
        <Button onClick={onRetry}>重试安装</Button>
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
