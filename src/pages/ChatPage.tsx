import { useEffect } from 'react';

import ChatConsole from '../features/chat/ChatConsole';
import { useChat } from '../features/chat/ChatContext';
import { startOnboardingTour } from '../features/onboarding/tour';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  const { transcript, chatState } = useChat();
  const showTopRail = !(transcript.length === 0 && chatState === 'idle');

  // 首次进入聊天页触发新手引导。startOnboardingTour 内部做了 localStorage 判定
  // 和锚点存在性过滤，重复调用或锚点找不到都是安全的 noop。
  useEffect(() => {
    void startOnboardingTour();
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showTopRail && <StageRail />}
        <ChatConsole />
      </div>
    </div>
  );
}
