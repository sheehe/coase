// 会话上下文：把 ChatProvider 注入到整个应用壳子。
import { createContext, useContext, type ReactNode } from 'react';

import { useChatSession, type ChatSessionValue } from './useChatSession';

const ChatContext = createContext<ChatSessionValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const value = useChatSession();
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be inside ChatProvider');
  return ctx;
}

export type { ChatSessionValue };
