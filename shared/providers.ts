// Provider 相关的共享类型。
// 同时被 agent/ (main process) 和 src/ (renderer) import，
// 所以只放类型声明，不含运行时代码（renderer 不能访问文件系统和 Electron API）。

export type ProviderProtocol = 'anthropic' | 'openai';
export type AuthMode = 'api_key' | 'auth_token';

/**
 * 用户实际保存的 provider 记录。持久化到 {userData}/config/providers.json。
 * credential 字段在 Phase 2 为明文，Phase 4 正式版前会用 Electron safeStorage 加密。
 */
export interface ProviderRecord {
  id: string;
  label: string;
  protocol: ProviderProtocol;
  baseURL: string;
  model: string;
  authMode: AuthMode;
  credential: string;
  /**
   * SDK 自动压缩阈值（token 数）。Claude Agent SDK 用这个值在累计 token 接近
   * 阈值时触发 auto-compact。合法范围 100k–1M；不设或设为无效值时走模型自适应
   * 默认（1M 窗口模型 ≈ 850k，其它 ≈ 160k）。
   */
  autoCompactWindow?: number;
}

/** 给 UI 挑选用的模板。不含 credential。 */
export interface ProviderPreset {
  id: string;
  label: string;
  protocol: ProviderProtocol;
  baseURL: string;
  defaultModel: string;
  authMode: AuthMode;
  hint?: string;
}

/** providers.json 的顶层结构。 */
export interface ProvidersFile {
  version: 1;
  activeProviderId: string | null;
  /**
   * 评审模型组（critic panel）的 provider id 列表。用于 idea-critic / paper-reviewer
   * 等 skill 的对抗评审。主模型是被评角色，critic 提供独立第二视角。
   * 配置 1 个即生效（单 critic 评语模式）；配置 ≥ 2 个进入对抗共识模式。
   * 未配置时为 null / undefined（向后兼容旧版 providers.json）。
   */
  criticPanelIds?: string[] | null;
  providers: ProviderRecord[];
}

/** Critic panel 单个模型的调用结果。 */
export interface CriticPanelEntry {
  providerId: string;
  providerLabel: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  /** 模型返回的纯文本（已做 preview 抽取，去掉 thinking 等）。 */
  responseText?: string;
  /** 失败时的错误消息；ok === true 时为 undefined。 */
  error?: string;
}

/** Critic panel 并行调度聚合结果。 */
export interface CriticPanelResult {
  /** 实际调用的 provider 数量（已剔除不存在 / 协议不支持的）。 */
  panelSize: number;
  /** 聚合完成耗时（从发起到所有调用结束，ms）。 */
  totalMs: number;
  entries: CriticPanelEntry[];
}

/** "测试连接" 按钮返回的结构化结果。 */
export interface TestConnectionResult {
  ok: boolean;
  /** HTTP 状态码，仅当确实拿到 HTTP 响应时才有值。 */
  status?: number;
  /** 从发起请求到拿到响应（或失败）的耗时（毫秒）。 */
  latencyMs: number;
  /** 面向用户的单行消息；成功和失败共用一个字段简化 UI。 */
  message: string;
  /** 测试时实际发给模型的用户消息。 */
  requestText?: string;
  /** 模型返回的文本摘要。 */
  responseText?: string;
}
