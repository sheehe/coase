// 会话历史共享类型。renderer 和 main 都 import。
//
// 一条 SessionLogEntry 对应 Phase 3 起的一次多轮 chat 会话：从用户发首条消息
// 到会话关闭（用户主动停止 / 超时 / 错误），累计所有 agent turn 的指标。
// 旧的 Phase 1/2 "一次 run = 一次 planner 单发" 模型已经下线。

export interface SessionLogEntry {
  sessionId: string;
  /** 会话开始时刻，epoch ms。 */
  startedAt: number;
  /** 会话结束时刻，epoch ms。 */
  endedAt: number;
  /** 首条用户消息的前 120 字符，用于 UI 上快速辨识。 */
  firstPrompt: string;
  /** 'config' 表示当前 active 的 providers.json 记录；'env' 表示 fallback 到 env。 */
  providerSource: 'config' | 'env';
  providerId?: string;
  providerLabel?: string;
  model: string;
  baseURL?: string;
  /** 用户消息数量（不含 agent turn）。 */
  userMessageCount: number;
  /** agent turn 累计数量（SDK 的 num_turns 口径）。 */
  agentTurnCount: number;
  /** 累计 wall-clock 时长，毫秒。 */
  totalDurationMs: number;
  /** 累计成本，美元；部分 provider 不返回时为 0。 */
  totalCostUsd: number;
  /** 会话整体是否成功：任何一个 turn failure 或运行期错误都会置 false。 */
  ok: boolean;
  /** 若 ok=false，最后一条有意义的错误描述。 */
  errorMessage?: string;
}
