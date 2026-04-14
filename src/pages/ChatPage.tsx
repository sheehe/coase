import ChatConsole from '../features/chat/ChatConsole';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <StageRail />
      <ChatConsole />
    </div>
  );
}
