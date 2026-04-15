// 聊天主视图：弱化运行卡片，让正文与输入区成为页面主轴。
import ChatComposer from './ChatComposer';
import EmptyHero from './EmptyHero';
import TranscriptMessage from './TranscriptMessage';
import { useChat } from './ChatContext';

export default function ChatConsole() {
  const { chatState, transcript, summaryRefreshKey, scrollRef } = useChat();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {transcript.length === 0 && chatState === 'idle' ? (
          <EmptyHero />
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto scroll-smooth">
            <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-6 py-8">
              {transcript.map((entry, i) => (
                <TranscriptMessage key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      <ChatComposer />
      <span className="hidden">{summaryRefreshKey}</span>
    </div>
  );
}
