// Anthropic 协议供应商配置读取器。
//
// 支持两条路径：
//   1. Anthropic 官方端点 —— 用 ANTHROPIC_API_KEY 鉴权
//   2. Anthropic 兼容端点（MiniMax / Moonshot / GLM 等）—— 用 ANTHROPIC_AUTH_TOKEN
//      + ANTHROPIC_BASE_URL 指定供应商网关地址
//
// 两种鉴权方式同时存在会被 Claude Code CLI 当成冲突，所以我们在读取时强制只能设一个。
//
// Phase 2 会把多供应商路由从 env 升级到 Settings UI，但 env 作为底层入口会继续保留。

export type AuthMode = 'api_key' | 'auth_token';

export interface ProviderConfig {
  /** 鉴权模式：决定 SDK 里往 env 写哪一个 key。 */
  authMode: AuthMode;
  /** 具体的 key / token 字符串。 */
  credential: string;
  /** 目标模型名。 */
  model: string;
  /** 自定义网关 base URL（第三方兼容端点必须设；官方端点留空即可）。 */
  baseURL?: string;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      '未找到 Anthropic 鉴权凭据。请在启动前设置下列两种方案之一：\n' +
        '  (a) ANTHROPIC_API_KEY —— Anthropic 官方端点\n' +
        '  (b) ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL —— 第三方 Anthropic 兼容端点（如 MiniMax）',
    );
    this.name = 'MissingApiKeyError';
  }
}

export class ConflictingAuthError extends Error {
  constructor() {
    super(
      'ANTHROPIC_API_KEY 与 ANTHROPIC_AUTH_TOKEN 同时存在会冲突。\n' +
        '请只保留一个：走 Anthropic 原生用前者，走 MiniMax / Moonshot / GLM 等兼容端点用后者。',
    );
    this.name = 'ConflictingAuthError';
  }
}

/**
 * 从 process.env 读取供应商配置。
 *
 * 模型名查找顺序：`ANTHROPIC_MODEL` → `COASE_MODEL` → 默认 `claude-sonnet-4-6`。
 * - `ANTHROPIC_MODEL` 是 Claude Code CLI 的官方环境变量，和上游文档一致，放第一优先
 * - `COASE_MODEL` 是我们自己加的覆盖入口，留给将来 Settings UI 用
 */
export function getProviderConfig(): ProviderConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.COASE_MODEL?.trim() ||
    'claude-sonnet-4-6';

  if (apiKey && authToken) {
    throw new ConflictingAuthError();
  }

  if (authToken) {
    return { authMode: 'auth_token', credential: authToken, model, baseURL };
  }
  if (apiKey) {
    return { authMode: 'api_key', credential: apiKey, model, baseURL };
  }
  throw new MissingApiKeyError();
}
