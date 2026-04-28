import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import ChatConsole from '../features/chat/ChatConsole';
import { useChat } from '../features/chat/ChatContext';
import { startOnboardingTour } from '../features/onboarding/tour';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  const { transcript, chatState } = useChat();
  const navigate = useNavigate();
  const showTopRail = !(transcript.length === 0 && chatState === 'idle');

  // 首次进入聊天页触发新手引导。startOnboardingTour 内部用 tourPromise 做了重入
  // 保护：跨路由跳转过程中 ChatPage remount 重复触发 useEffect 也只跑一份。
  // navigate 注入给 tour 用于跨页步骤切换（设置页 → 聊天页 → 设置页）。
  useEffect(() => {
    void startOnboardingTour({ navigate: (to) => navigate(to) });
  }, [navigate]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showTopRail && <StageRail />}
        <ChatConsole />
      </div>
    </div>
  );
}
