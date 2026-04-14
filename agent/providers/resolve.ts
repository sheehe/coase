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
