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
  // Token 分项。老记录无这些字段时按 undefined 渲染为 —。
  // 国产 Anthropic 兼容 provider 的 cache 字段语义不统一，
  // 在 run-chat.ts 的 normalizeUsage 里做过去重，这里存已归一化后的值。
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCacheTokens?: number;
  ok: boolean;
  errorMessage?: string;
}
