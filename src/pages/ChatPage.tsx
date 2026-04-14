import ChatConsole from '../features/chat/ChatConsole';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <StageRail />
      <ChatConsole />
    </div>
  );
}
