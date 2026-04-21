import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import RuntimeGate from './features/runtime/RuntimeGate';
import AppLayout from './layouts/AppLayout';
import ChatPage from './pages/ChatPage';
import ResearchSettingsPage from './pages/ResearchSettingsPage';
import SettingsPage from './pages/SettingsPage';
import UsagePage from './pages/UsagePage';
import type { CoaseApi } from '../shared/ipc';

declare global {
  interface Window {
    coase: CoaseApi;
  }
}

/**
 * 顶层路由。用 HashRouter 而不是 BrowserRouter：
 * Electron 打包后走 file:// 协议，没有服务器来响应 /chat /settings 之类的路径，
 * BrowserRouter 在刷新或深链时会挂；HashRouter 走 `#/xxx` 是纯客户端路由，零服务器依赖。
 */
export default function App() {
  // RuntimeGate 盖在路由之上：研究环境（R + Python）没装好之前，展示安装向导；
  // state === 'ready' 时透传，路由照常工作。把 gate 放这一层而不是 AppLayout 里，
  // 是为了让装机过程完全不挂 ChatProvider——省得 chat 上下文在无 R 环境的情况下
  // 尝试恢复会话。
  return (
    <HashRouter>
      <RuntimeGate>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="research-settings" element={<ResearchSettingsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Route>
        </Routes>
      </RuntimeGate>
    </HashRouter>
  );
}
