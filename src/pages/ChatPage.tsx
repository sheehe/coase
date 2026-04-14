import ChatConsole from '../features/chat/ChatConsole';
import StageRail from '../layouts/StageRail';

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      {/* TODO: 待真实 pipeline 状态机落地后接入 currentStage / metrics。 */}
      <StageRail currentStage="planner" />
      <ChatConsole />
    </div>
  );
}
