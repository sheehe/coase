import type {
  ProviderPreset,
  ProviderRecord,
  ProvidersFile,
  TestConnectionResult,
} from './providers';
import type { SessionLogEntry } from './runs';
import type { SkillInfo } from './skills';

export interface PingResult {
  pong: boolean;
  version: string;
  electron: string;
  node: string;
  chrome: string;
}

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

export type Unsubscribe = () => void;

export interface ProvidersApi {
  list: () => Promise<ProvidersFile>;
  upsert: (record: ProviderRecord) => Promise<void>;
  delete: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  presets: () => Promise<ProviderPreset[]>;
  testConnection: (record: ProviderRecord) => Promise<TestConnectionResult>;
}

export interface ChatApi {
  start: (firstMessage: string) => Promise<ChatStartOutcome>;
  send: (sessionId: string, text: string) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
  onEvent: (sessionId: string, handler: (event: ChatEvent) => void) => Unsubscribe;
}

export interface SessionsApi {
  recent: (limit?: number) => Promise<SessionLogEntry[]>;
}

export interface SkillsApi {
  list: () => Promise<SkillInfo[]>;
}

export interface REnvStatus {
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface REnvApi {
  check: () => Promise<REnvStatus>;
}

export interface CoaseApi {
  ping: () => Promise<PingResult>;
  chat: ChatApi;
  providers: ProvidersApi;
  sessions: SessionsApi;
  skills: SkillsApi;
  rEnv: REnvApi;
}
