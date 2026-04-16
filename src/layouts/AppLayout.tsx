import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Outlet } from 'react-router-dom';

import type { PingResult } from '../../shared/ipc';
import { ChatProvider } from '../features/chat/ChatContext';
import DesktopChromeBar from './DesktopChromeBar';
import SessionSidebar from './SessionSidebar';

const SIDEBAR_WIDTH_KEY = 'coase.layout.sidebarWidth';
const DEFAULT_SIDEBAR_WIDTH = 272;

/**
 * 应用外壳：左侧会话栏 + 中间内容区 + 底部状态栏。
 */
export default function AppLayout() {
  const [pong, setPong] = useState<PingResult | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH, 220, 420),
  );
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const pinged = useRef(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const ping = useCallback(async () => {
    try {
      const res = await window.coase.ping();
      setPong(res);
    } catch (err) {
      console.error('ping failed', err);
    }
  }, []);

  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    void ping();
  }, [ping]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const nextWidth = dragState.startWidth + (event.clientX - dragState.startX);
      setSidebarWidth(clamp(nextWidth, 220, 420));
    };

    const onMouseUp = () => {
      dragStateRef.current = null;
      setIsSidebarResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startSidebarResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    dragStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    setIsSidebarResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  };

  return (
    <ChatProvider>
      <div className="flex h-screen overflow-hidden bg-app text-fg">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DesktopChromeBar
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
          />
          <div className="flex min-h-0 min-w-0 flex-1">
            {sidebarVisible && (
              <>
                <div className="min-h-0 shrink-0" style={{ width: sidebarWidth }}>
                  <SessionSidebar />
                </div>

                <div
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={startSidebarResize}
                  onDoubleClick={resetSidebarWidth}
                  onMouseEnter={() => setIsSidebarHovered(true)}
                  onMouseLeave={() => setIsSidebarHovered(false)}
                  className={[
                    'group flex w-3 shrink-0 cursor-col-resize items-stretch justify-center transition-colors',
                    isSidebarResizing
                      ? 'bg-black/[0.05]'
                      : isSidebarHovered
                        ? 'bg-black/[0.03]'
                        : 'bg-transparent hover:bg-black/[0.03]',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'h-full w-px transition-colors duration-150',
                      isSidebarResizing
                        ? 'bg-accent'
                        : isSidebarHovered
                          ? 'bg-border-strong'
                          : 'bg-transparent group-hover:bg-border-strong',
                    ].join(' ')}
                  />
                </div>
              </>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <main className="min-h-0 flex-1 overflow-hidden">
                <Outlet />
              </main>
            </div>
          </div>
        </div>
        <RuntimeBadge pong={pong} />
      </div>
    </ChatProvider>
  );
}

function RuntimeBadge({ pong }: { pong: PingResult | null }) {
  if (!pong) return <span className="hidden">loading…</span>;
  return (
    <span className="hidden">
      electron {pong.electron} · node {pong.node} · app {pong.version}
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredWidth(key: string, fallback: number, min: number, max: number) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}
