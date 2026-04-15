// 统一 provider 解析入口。
//
// 优先级：
//   1. providers.json 里 activeProviderId 指向的记录
//   2. fallback 到 env（保留 Phase 1 的启动方式，不破坏现有 PowerShell 注入流程）
//
// agent/sdk/client.ts 只应调用这里；其它地方不允许直接读 env 或读文件。
// 这样 Settings UI 和 env 两条路径可以无缝共存。

import { loadProvidersFile } from './config-store';
import type { AuthMode } from './presets';
import {
  getProviderConfig as getEnvProviderConfig,
  MissingApiKeyError,
} from './anthropic-native';

export interface ResolvedProvider {
  source: 'config' | 'env';
  authMode: AuthMode;
  credential: string;
  model: string;
  baseURL?: string;
  /** 仅在 source='config' 时有值，便于日志 / 审计。 */
  providerId?: string;
  providerLabel?: string;
  /**
   * 可选的 SDK autoCompactWindow（token 数）。source='env' 时永远为 undefined，
   * 由 sdk/client.ts 回退到模型自适应默认。
   */
  autoCompactWindow?: number;
}

export class NoProviderConfiguredError extends Error {
  constructor() {
    super(
      '当前没有可用的 provider。请在 Settings 页新增并激活一个 provider，' +
        '或在启动前设置 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN 环境变量。',
    );
    this.name = 'NoProviderConfiguredError';
  }
}

/**
 * Provider 设置里填的 autoCompactWindow 数字不一定合理：留空、NaN、越界都会
 * 被当作"未设置"处理，让 sdk/client.ts 走模型自适应默认。合法范围参考 SDK
 * sdk.d.ts 里的 autoCompactWindow 文档——100k–1M。
 */
function normalizeAutoCompactWindow(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 100_000 || rounded > 1_000_000) return undefined;
  return rounded;
}

export class UnsupportedProtocolError extends Error {
  constructor(protocol: string, providerLabel: string) {
    super(
      `Provider ${providerLabel} 使用 ${protocol} 协议，Phase 2 暂只支持 anthropic 协议。` +
        'OpenAI 协议将在 Phase 2.5 加入。',
    );
    this.name = 'UnsupportedProtocolError';
  }
}

/**
 * 解析当前应该使用的 provider 配置。
 * 会先读 providers.json，miss 时 fallback 到 env。
 */
export async function resolveActiveProvider(): Promise<ResolvedProvider> {
  // 1. providers.json 优先
  const file = await loadProvidersFile();
  if (file.activeProviderId) {
    const active = file.providers.find((p) => p.id === file.activeProviderId);
    if (active) {
      if (active.protocol !== 'anthropic') {
        throw new UnsupportedProtocolError(active.protocol, active.label);
      }
      if (!active.credential) {
        throw new Error(
          `Provider ${active.label} 没有设置 credential，请在 Settings 里填入 API key。`,
        );
      }
      return {
        source: 'config',
        authMode: active.authMode,
        credential: active.credential,
        model: active.model,
        baseURL: active.baseURL || undefined,
        providerId: active.id,
        providerLabel: active.label,
        autoCompactWindow: normalizeAutoCompactWindow(active.autoCompactWindow),
      };
    }
    // activeProviderId 指向已删除的记录：fall through 到 env
  }

  // 2. env fallback
  try {
    const envCfg = getEnvProviderConfig();
    return {
      source: 'env',
      authMode: envCfg.authMode,
      credential: envCfg.credential,
      model: envCfg.model,
      baseURL: envCfg.baseURL,
    };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      throw new NoProviderConfiguredError();
    }
    throw err;
  }
}
