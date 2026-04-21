import type {
  CriticPanelResult,
  ProviderPreset,
  ProviderRecord,
  ProvidersFile,
  TestConnectionResult,
} from './providers';
import type { ResearchPrefs } from './research-prefs';
import type { SessionLogEntry } from './runs';
import type { SkillInfo } from './skills';

export interface PingResult {
  pong: boolean;
  version: string;
  electron: string;
  node: string;
  chrome: string;
}

export type AttachmentKind = 'dataset_folder' | 'data_file' | 'paper_file' | 'other_file';

export interface AttachedPath {
  kind: AttachmentKind;
  path: string;
}

export interface ChatMessageInput {
  text: string;
  displayText?: string;
  attachments?: AttachedPath[];
  workspaceRoot?: string;
}

export type ChatEvent =
  | { type: 'session_started'; firstPrompt: string }
  | { type: 'sdk_session_bound'; sdkSessionId: string }
  | {
      type: 'session_finished';
      reason: 'user_cancel' | 'user_interrupt' | 'agent_done' | 'error';
    }
  | { type: 'status_message'; text: string }
  | {
      type: 'provider';
      source: 'config' | 'env';
      providerId?: string;
      providerLabel?: string;
      model: string;
      baseURL?: string;
    }
  | { type: 'user_message_accepted'; text: string }
  | {
      type: 'assistant_text';
      text: string;
      messageId?: string;
      parentToolUseId?: string | null;
    }
  | {
      type: 'assistant_text_delta';
      messageId: string;
      delta: string;
      parentToolUseId?: string | null;
    }
  | {
      type: 'assistant_thinking';
      text: string;
      messageId?: string;
      parentToolUseId?: string | null;
    }
  | {
      type: 'subagent';
      phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
      text: string;
      taskId?: string;
      description?: string;
      lastToolName?: string;
      toolUses?: number;
      durationMs?: number;
      totalTokens?: number;
    }
  | {
      type: 'tool_use';
      name: string;
      input: unknown;
      toolUseId?: string;
      parentToolUseId?: string | null;
    }
  | {
      type: 'tool_result';
      text: string;
      isError: boolean;
      toolUseId?: string;
    }
  | {
      type: 'tool_progress';
      toolUseId: string;
      toolName: string;
      elapsedSeconds: number;
      parentToolUseId?: string | null;
    }
  | { type: 'error'; message: string }
  | {
      // LLM / provider 调用失败的结构化事件。比 `error`（只有 message 字符串）
      // 多一层元信息，前端用它渲染"失败详情 + 将自动重试"的醒目日志，便于
      // 用户排查 provider / 网络 / auth 问题。
      type: 'llm_call_failed';
      // 失败发生的阶段：`api_error` 是 SDK 成功走完一轮但 provider 返回错误
      // （result 消息带 subtype != success）；`stream_error` 是 SDK 迭代器
      // 本身抛异常（子进程死、网络流中断等）。
      phase: 'api_error' | 'stream_error';
      providerLabel?: string;
      model?: string;
      subtype?: string;
      errorMessage: string;
      /** 最近几 KB stderr，帮助排查 spawn / 鉴权 / 证书等底层问题。 */
      stderrTail?: string;
      /** true 表示紧跟着会有 retry_attempt。false 表示已达重试上限或不可重试。 */
      willRetry: boolean;
    }
  | {
      // 指数退避重试事件。每次进入 sleep 前发一次。前端用它在 transcript
      // 里打一条"重试 N/M · 下次 Ys"的小日志，并在顶栏活动 pill 中反映。
      type: 'retry_attempt';
      attempt: number;
      maxAttempts: number;
      nextDelayMs: number;
      reason: string;
    }
  | {
      type: 'context_usage';
      total_tokens: number;
      max_tokens: number;
      raw_max_tokens: number;
      percentage: number;
      model?: string;
      categories: Array<{
        name: string;
        tokens: number;
        color: string;
        isDeferred?: boolean;
      }>;
    }
  | {
      type: 'turn_result';
      ok: true;
      cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    }
  | {
      type: 'turn_result';
      ok: false;
      subtype?: string;
      errors?: string[];
      cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };

export interface ChatStartOutcome {
  sessionId: string;
  workspaceRoot: string;
}

export interface ChatResumeInput {
  sdkSessionId: string;
  /**
   * 被续跑的 Coase 会话 id。main 进程会用它复用工作区、合并累计总耗、保留原始
   * firstPrompt / startedAt，这样续跑的结果在侧边栏里依然显示为同一行。
   * 不传时 main 会退化成"把 resume 当成一次新会话"的旧语义——留着是为了兼容
   * 老调用路径，新代码都应该传。
   */
  coaseSessionId?: string;
  guidance: string;
  displayGuidance?: string;
  attachments?: AttachedPath[];
  workspaceRoot?: string;
}

export type Unsubscribe = () => void;

export interface CriticPanelInvokePayload {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ResearchPrefsApi {
  get: () => Promise<ResearchPrefs>;
  set: (prefs: ResearchPrefs) => Promise<ResearchPrefs>;
}

export interface ProvidersApi {
  list: () => Promise<ProvidersFile>;
  upsert: (record: ProviderRecord) => Promise<void>;
  delete: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  presets: () => Promise<ProviderPreset[]>;
  testConnection: (record: ProviderRecord) => Promise<TestConnectionResult>;
  getCriticPanel: () => Promise<string[]>;
  setCriticPanel: (ids: string[] | null) => Promise<void>;
  invokeCriticPanel: (payload: CriticPanelInvokePayload) => Promise<CriticPanelResult>;
}

export interface ChatApi {
  start: (payload: ChatMessageInput) => Promise<ChatStartOutcome>;
  resume: (payload: ChatResumeInput) => Promise<ChatStartOutcome>;
  send: (sessionId: string, payload: ChatMessageInput) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
  interrupt: (sessionId: string) => Promise<void>;
  onEvent: (sessionId: string, handler: (event: ChatEvent) => void) => Unsubscribe;
}

export interface SessionsApi {
  recent: (limit?: number) => Promise<SessionLogEntry[]>;
  delete: (sessionId: string) => Promise<void>;
  transcript: (sessionId: string) => Promise<TranscriptEntryPersisted[]>;
  persistTranscript: (
    sessionId: string,
    entries: TranscriptEntryPersisted[],
  ) => Promise<void>;
  insights: (sessionId: string) => Promise<RunInsightsPersisted | null>;
  persistInsights: (sessionId: string, insights: RunInsightsPersisted) => Promise<void>;
}

export interface OpenPathResult {
  ok: boolean;
  error?: string;
}

export interface ArtifactsApi {
  openPath: (filePath: string) => Promise<OpenPathResult>;
}

export interface WindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
  close: () => Promise<void>;
}

export type AppUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateSnapshot {
  supported: boolean;
  enabled: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  provider?: string;
  availableVersion?: string;
  downloadedVersion?: string;
  progressPercent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  message?: string;
  releaseDate?: string;
  updateInfoUrl?: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
}

export interface AppUpdateApi {
  getState: () => Promise<AppUpdateSnapshot>;
  check: () => Promise<AppUpdateSnapshot>;
  download: () => Promise<AppUpdateSnapshot>;
  install: () => Promise<void>;
  onEvent: (handler: (snapshot: AppUpdateSnapshot) => void) => Unsubscribe;
}

export interface SkillImportResult {
  ok: boolean;
  /** 导入成功时为 skill name，失败时为 undefined。 */
  name?: string;
  /** 失败原因。 */
  error?: string;
}

export interface SkillsApi {
  list: () => Promise<SkillInfo[]>;
  /** 弹出文件/文件夹选择器，导入 skill 到 coase-user plugin。 */
  import: () => Promise<SkillImportResult>;
  /** 删除一个 coase-user skill（builtin 不可删除）。 */
  delete: (skillName: string) => Promise<void>;
  /** 在系统文件管理器中打开 coase-user skills 目录。 */
  openUserDir: () => Promise<void>;
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

export type RuntimeInstallState =
  | 'unknown'
  | 'not_installed'
  | 'installing'
  | 'ready'
  | 'error';

export interface RuntimeSnapshot {
  state: RuntimeInstallState;
  /** 研究环境在磁盘上的根目录（.pixi/envs/default）。 */
  rootDir: string;
  message?: string;
  /** 最近 ≤50 行 pixi 输出，安装时实时增长。 */
  logsTail: string[];
  errorDetail?: string;
}

export interface RuntimeApi {
  getSnapshot: () => Promise<RuntimeSnapshot>;
  /** 触发安装；幂等——重复调用复用同一次 pixi 进程。 */
  install: () => Promise<RuntimeSnapshot>;
  /** 订阅状态变更。建立订阅时会立即回放一次当前 snapshot。 */
  onEvent: (handler: (snapshot: RuntimeSnapshot) => void) => Unsubscribe;
}

export interface FilesApi {
  pick: (kind: AttachmentKind) => Promise<string[]>;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  filePath?: string;
  children?: WorkspaceTreeNode[];
}

export interface WorkspaceFilePreview {
  filePath: string;
  name: string;
  content: string;
  mediaType: string;
}

export interface WorkspacesApi {
  pickDirectory: () => Promise<string | null>;
  getRoot: (sessionId: string) => Promise<string | null>;
  listTree: (sessionId: string) => Promise<WorkspaceTreeNode[]>;
  previewFile: (filePath: string) => Promise<WorkspaceFilePreview | null>;
}

export type TranscriptEntryPersisted =
  | { kind: 'status'; ts: number; text: string }
  | {
      kind: 'provider';
      ts: number;
      text: string;
      providerId?: string;
      providerLabel?: string;
      model: string;
      baseURL?: string;
    }
  | { kind: 'user'; ts: number; text: string }
  | {
      kind: 'assistant';
      ts: number;
      text: string;
      messageId?: string;
      streaming?: boolean;
    }
  | { kind: 'guidance'; ts: number; text: string }
  | {
      kind: 'subagent';
      ts: number;
      phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
      text: string;
      taskId?: string;
      description?: string;
      lastToolName?: string;
      toolUses?: number;
      durationMs?: number;
      totalTokens?: number;
    }
  | { kind: 'thinking'; ts: number; text: string; messageId?: string }
  | {
      kind: 'tool_use';
      ts: number;
      name: string;
      input: unknown;
      toolUseId?: string;
      parentToolUseId?: string | null;
      elapsedSeconds?: number;
      status?: 'running' | 'done';
    }
  | {
      kind: 'tool_result';
      ts: number;
      text: string;
      isError: boolean;
      toolUseId?: string;
    }
  | { kind: 'error'; ts: number; text: string }
  | {
      kind: 'llm_call_failed';
      ts: number;
      phase: 'api_error' | 'stream_error';
      providerLabel?: string;
      model?: string;
      subtype?: string;
      errorMessage: string;
      stderrTail?: string;
      willRetry: boolean;
    }
  | {
      kind: 'retry_attempt';
      ts: number;
      attempt: number;
      maxAttempts: number;
      nextDelayMs: number;
      reason: string;
    }
  | {
      kind: 'turn_result';
      ts: number;
      ok: boolean;
      detail: string;
      turns?: number;
      durationMs?: number;
      costUsd?: number;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheCreationInputTokens?: number;
      cacheReadInputTokens?: number;
    };

export interface MilestonePersisted {
  id: string;
  ts: number;
  kind: 'run_started' | 'stage_reached' | 'interrupted' | 'completed' | 'failed';
  label: string;
  stage?: 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer';
}

export interface ArtifactPersisted {
  id: string;
  ts: number;
  kind:
    | 'plan'
    | 'r_script'
    | 'results_text'
    | 'draft_section'
    | 'review_note'
    | 'table'
    | 'figure'
    | 'generated_file'
    | 'final_paper';
  title: string;
  contentPreview: string;
  content: string;
  inferredStage?: 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer';
  sourceTool?: string;
  path?: string;
  mediaType?: string;
  filePath?: string;
}

export interface RunInsightsPersisted {
  currentMilestone: string;
  milestones: MilestonePersisted[];
  artifacts: ArtifactPersisted[];
}

export interface CoaseApi {
  ping: () => Promise<PingResult>;
  updates: AppUpdateApi;
  chat: ChatApi;
  files: FilesApi;
  workspaces: WorkspacesApi;
  providers: ProvidersApi;
  researchPrefs: ResearchPrefsApi;
  sessions: SessionsApi;
  artifacts: ArtifactsApi;
  window: WindowApi;
  skills: SkillsApi;
  rEnv: REnvApi;
  runtime: RuntimeApi;
}
