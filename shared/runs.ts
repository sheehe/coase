// 会话历史共享类型：main 与 renderer 共用。
export interface SessionLogEntry {
  sessionId: string;
  sdkSessionId?: string;
  workspaceRoot?: string;
  finishReason?: 'user_cancel' | 'user_interrupt' | 'agent_done' | 'error';
  startedAt: number;
  endedAt: number;
  firstPrompt: string;
  providerSource: 'config' | 'env';
  providerId?: string;
  providerLabel?: string;
  model: string;
  baseURL?: string;
  userMessageCount: number;
  agentTurnCount: number;
  totalDurationMs: number;
  totalCostUsd: number;
  totalTokens?: number;
  ok: boolean;
  errorMessage?: string;
}
