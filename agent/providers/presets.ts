// 内置 provider preset。
//
// 这里的数据来源是 doc/dev/01-tech-stack.md 里的供应商矩阵，由项目第一方维护，
// 不拷 cc-switch 等外部项目的数据，避免引入 license / attribution 问题。
//
// preset 只描述"模板"——不含 credential。用户在 Settings UI 里选中 preset 后
// 填入自己的 API key 才会真正写入 providers.json。
//
// Phase 2 只支持 protocol='anthropic'；OpenAI 协议延到 Phase 2.5（roadmap 决策 A3）。

import type { ProviderPreset } from '../../shared/providers';

// 类型从 shared/ re-export 一份，让 agent/ 内部 import 路径更短
export type {
  AuthMode,
  ProviderPreset,
  ProviderProtocol,
  ProviderRecord,
  ProvidersFile,
} from '../../shared/providers';

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (官方)',
    protocol: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    authMode: 'api_key',
    hint: '在 console.anthropic.com 创建 API key。',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek (V4 Flash) · 非思考模型',
    protocol: 'anthropic',
    baseURL: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-v4-flash',
    authMode: 'auth_token',
    disableThinking: true,
    hint: '在 platform.deepseek.com 创建 API key，使用 Anthropic 兼容端点。每次请求附带 thinking.type=disabled，对应原 deepseek-chat（2026/07/24 弃用）。',
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek (V4 Flash)',
    protocol: 'anthropic',
    baseURL: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-v4-flash',
    authMode: 'auth_token',
    hint: 'DeepSeek V4 Flash 默认思考模式，走 Anthropic 兼容端点；对应原 deepseek-reasoner（2026/07/24 弃用）。',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    protocol: 'anthropic',
    baseURL: 'https://api.moonshot.cn/anthropic',
    defaultModel: 'kimi-k2.5',
    authMode: 'auth_token',
    hint: '在 platform.moonshot.cn 开通 Anthropic 兼容端点。',
  },
  {
    id: 'moonshot-k2-6',
    label: 'Moonshot (Kimi K2.6)',
    protocol: 'anthropic',
    baseURL: 'https://api.moonshot.cn/anthropic',
    defaultModel: 'kimi-k2.6',
    authMode: 'auth_token',
    hint: 'Kimi K2.6 走同一套 Anthropic 兼容端点。',
  },
  {
    id: 'moonshot-k2-6-fast',
    label: 'Moonshot (Kimi K2.6) · 非思考模型',
    protocol: 'anthropic',
    baseURL: 'https://api.moonshot.cn/anthropic',
    defaultModel: 'kimi-k2.6',
    authMode: 'auth_token',
    disableThinking: true,
    hint: '同 K2.6 模型，但每次请求都禁用思考链（thinking.type=disabled），token 消耗与单次成本显著降低；适合预算敏感或不需要长链路推理的任务。',
  },
  {
    id: 'zai',
    label: 'Z.ai (智谱 GLM)',
    protocol: 'anthropic',
    baseURL: 'https://api.z.ai/api/anthropic',
    defaultModel: 'glm-5.1',
    authMode: 'auth_token',
    hint: '在 bigmodel.cn 创建 API key，使用 Anthropic 兼容端点。',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    protocol: 'anthropic',
    baseURL: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M2.7',
    authMode: 'auth_token',
    hint: 'Phase 1 POC 默认使用的供应商。在 platform.minimaxi.com 创建 API key。',
  },
] as const;

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
