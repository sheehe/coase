// 共享 IPC 契约：preload / renderer / main 都从这里导入类型。
// 这个目录被 tsconfig.node.json 和 tsconfig.web.json 同时 include。

import type {
  ProviderPreset,
  ProviderRecord,
  ProvidersFile,
  TestConnectionResult,
} from './providers';
import type { SessionLogEntry } from './runs';
import type { SkillInfo } from './skills';

// ---- Phase 0: ping -----------------------------------------------------

export interface PingResult {
  pong: boolean;
  version: string;
  electron: string;
  node: string;
  chrome: string;
}

// ---- Phase 3: 多轮 chat 会话事件 -----------------------------------------

/**
 * 一次 chat 会话过程中通过 main → renderer push 下去的事件流。
 * main 侧由 agent/orchestrator/run-chat.ts 产生，
 * renderer 侧由 ChatConsole 订阅并渲染。
 *
 * 一个会话里同类事件会反复出现（每个 agent turn 都会有 result），
 * UI 需要把它们按顺序追加到 transcript。'session_finished' 是会话级事件，
 * 只有会话真正结束时才会发送一次。
 */
export type ChatEvent =
  | { type: 'session_started'; firstPrompt: string }
  | { type: 'session_finished'; reason: 'user_cancel' | 'agent_done' | 'error' }
  | {
      type: 'provider';
      source: 'config' | 'env';
      providerId?: string;
      providerLabel?: string;
      model: string;
      baseURL?: string;
    }
  | { type: 'user_message_accepted'; text: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string; isError: boolean }
  | { type: 'error'; message: string }
  | {
      type: 'turn_result';
      ok: true;
      cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
    }
  | {
      type: 'turn_result';
      ok: false;
      subtype?: string;
      errors?: string[];
      cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
    };

export interface ChatStartOutcome {
  sessionId: string;
}

/**
 * renderer 端的订阅取消函数。调用后不再接收事件。
 */
export type Unsubscribe = () => void;

// ---- Phase 2: providers CRUD --------------------------------------------

/**
 * renderer 端访问 providers 配置的 API。
 * 所有方法都是 async，走 IPC 到 main process，main 负责真正的文件读写。
 *
 * 安全说明：credential 字段目前以明文形式在 IPC 上传输（Phase 2 决策 D）。
 * Phase 4 会切到 safeStorage，届时 IPC 会改为返回 masked 字段 + 单独的 reveal 调用。
 */
export interface ProvidersApi {
  list: () => Promise<ProvidersFile>;
  upsert: (record: ProviderRecord) => Promise<void>;
  delete: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  presets: () => Promise<ProviderPreset[]>;
  /**
   * 用当前表单值实际打一下 /v1/messages（max_tokens=1），
   * 返回状态 + 耗时。不落盘，可用于"保存前先测一下"。
   */
  testConnection: (record: ProviderRecord) => Promise<TestConnectionResult>;
}

// ---- Phase 3: chat 会话管理 ---------------------------------------------

export interface ChatApi {
  /** 用首条用户消息发起一次新会话，main 返回新的 sessionId。 */
  start: (firstMessage: string) => Promise<ChatStartOutcome>;
  /** 给已有会话推一条新的用户消息。main 会把它塞进 PromptQueue，agent 下一 turn 消化。 */
  send: (sessionId: string, text: string) => Promise<void>;
  /** 主动中止一次会话：abort + 关闭队列 + 落日志。 */
  cancel: (sessionId: string) => Promise<void>;
  /** 订阅一个会话的事件流，返回 unsubscribe。 */
  onEvent: (sessionId: string, handler: (event: ChatEvent) => void) => Unsubscribe;
}

// ---- Phase 2/3: session history -----------------------------------------

export interface SessionsApi {
  /** 最近 N 条会话日志，按时间倒序；默认 100。 */
  recent: (limit?: number) => Promise<SessionLogEntry[]>;
}

// ---- Phase 3: skill 列表 -------------------------------------------------

export interface SkillsApi {
  /** 扫描 coase-builtin + coase-user 两个 plugin，返回所有可见 skill。 */
  list: () => Promise<SkillInfo[]>;
}

// ---- Preload 暴露给 renderer 的 API 接口 --------------------------------

export interface CoaseApi {
  ping: () => Promise<PingResult>;
  chat: ChatApi;
  providers: ProvidersApi;
  sessions: SessionsApi;
  skills: SkillsApi;
}
