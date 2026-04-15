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
  providers: ProviderRecord[];
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
}
