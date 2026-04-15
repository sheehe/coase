import ChatConsole from '../features/chat/ChatConsole';
import { useChat } from '../features/chat/ChatContext';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  const { transcript, chatState } = useChat();
  const showTopRail = !(transcript.length === 0 && chatState === 'idle');

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showTopRail && <StageRail />}
        <ChatConsole />
      </div>
    </div>
  );
}
