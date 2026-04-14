import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';

import type { PingResult } from '../../shared/ipc';
import { ChatProvider } from '../features/chat/ChatContext';
import SessionSidebar from './SessionSidebar';
import StatusFooter from './StatusFooter';

/**
 * 应用外壳：左侧会话历史 + 主区内容 + 底部状态栏。
 */
export default function AppLayout() {
  const [pong, setPong] = useState<PingResult | null>(null);
  const pinged = useRef(false);

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

  return (
    <ChatProvider>
      <div className="flex min-h-screen bg-app text-fg">
        <SessionSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
          </main>
          <StatusFooter />
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
