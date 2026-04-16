// Provider 单次调用工具 + critic panel 并行调度。
//
// 设计要点：
// - critic panel 的模型调用是"一次 prompt → 一次 response"的简单场景，
//   不需要走完整的 Claude Agent SDK CLI（子进程启动 + 多轮 loop 太重）。
// - 直接按 Anthropic Messages API 规范发 HTTP 请求，效率最高。
// - 与 test-connection.ts 共享 response 解析逻辑，但 test-connection 偏向
//   "验证连通性 + 返回 preview"，本模块偏向"真实业务调用 + 返回完整文本"。
// - 仅支持 `anthropic` 协议；`openai` 协议等后续扩展。

import type {
  CriticPanelEntry,
  CriticPanelResult,
  ProviderRecord,
} from '../../shared/providers';
import { getCriticPanelIds, loadProvidersFile } from './config-store';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;

export interface InvokeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface InvokeOptions {
  system?: string;
  messages: InvokeMessage[];
  maxTokens?: number;
  timeoutMs?: number;
}

export interface InvokeOutcome {
  ok: boolean;
  latencyMs: number;
  responseText?: string;
  error?: string;
  httpStatus?: number;
}

/** 单个 provider 的裸 Messages API 调用。返回完整响应文本（拼接 text 块）。 */
export async function invokeProvider(
  record: ProviderRecord,
  options: InvokeOptions,
): Promise<InvokeOutcome> {
  if (record.protocol !== 'anthropic') {
    return {
      ok: false,
      latencyMs: 0,
      error: `不支持的协议：${record.protocol}（critic panel 当前仅支持 anthropic 协议 provider）`,
    };
  }
  if (!record.baseURL || !record.credential || !record.model) {
    return {
      ok: false,
      latencyMs: 0,
      error: `provider ${record.label} 缺少 baseURL / credential / model`,
    };
  }

  const url = `${record.baseURL.replace(/\/+$/, '')}/v1/messages`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (record.authMode === 'api_key') {
    headers['x-api-key'] = record.credential;
  } else {
    headers.authorization = `Bearer ${record.credential}`;
  }

  const body: Record<string, unknown> = {
    model: record.model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (options.system) body.system = options.system;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const raw = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        httpStatus: res.status,
        error: `HTTP ${res.status}: ${summarizeRaw(raw)}`,
      };
    }

    const text = extractTextFromResponse(raw);
    if (!text) {
      return {
        ok: false,
        latencyMs,
        httpStatus: res.status,
        error: '响应中未找到可读 text 内容（可能只有 thinking 块或结构异常）',
      };
    }

    return {
      ok: true,
      latencyMs,
      httpStatus: res.status,
      responseText: text,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        ok: false,
        latencyMs,
        error: `请求超时 (> ${(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000}s)`,
      };
    }
    return {
      ok: false,
      latencyMs,
      error: `网络错误：${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 并行调用评审模型组。读取 providers.json 里的 criticPanelIds，对每个 id 发起
 * 独立调用，Promise.all 聚合。
 *
 * 失败的 provider 不会阻塞其他 provider；最终 entries 里每个条目都会标明
 * ok / error 状态。
 */
export async function invokeCriticPanel(
  options: InvokeOptions,
): Promise<CriticPanelResult> {
  const ids = await getCriticPanelIds();
  if (ids.length === 0) {
    return { panelSize: 0, totalMs: 0, entries: [] };
  }

  const file = await loadProvidersFile();
  const recordById = new Map(file.providers.map((p) => [p.id, p]));

  const startedAt = Date.now();
  const entries = await Promise.all(
    ids.map(async (id): Promise<CriticPanelEntry> => {
      const record = recordById.get(id);
      if (!record) {
        return {
          providerId: id,
          providerLabel: id,
          model: '',
          ok: false,
          latencyMs: 0,
          error: `provider ${id} 已被删除`,
        };
      }
      const result = await invokeProvider(record, options);
      return {
        providerId: record.id,
        providerLabel: record.label,
        model: record.model,
        ok: result.ok,
        latencyMs: result.latencyMs,
        responseText: result.responseText,
        error: result.error,
      };
    }),
  );

  return {
    panelSize: entries.length,
    totalMs: Date.now() - startedAt,
    entries,
  };
}

// ---- Response text 抽取（简化自 test-connection.ts） -------------------------

function extractTextFromResponse(raw: string): string {
  if (!raw) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const payload = parsed as Record<string, unknown>;

  const chunks: string[] = [];
  const content = payload.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.text === 'string' && record.text.trim()) {
        chunks.push(record.text);
      }
    }
  }

  if (chunks.length > 0) return chunks.join('\n').trim();

  const completion = payload.completion;
  if (typeof completion === 'string' && completion.trim()) return completion.trim();

  const outputText = payload.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();

  return '';
}

function summarizeRaw(raw: string): string {
  if (!raw) return '(empty body)';
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const err = payload.error;
    if (err && typeof err === 'object') {
      const errRec = err as Record<string, unknown>;
      if (typeof errRec.message === 'string') return errRec.message;
      if (typeof errRec.type === 'string') return errRec.type;
    }
    if (typeof err === 'string') return err;
  } catch {
    // 不是 JSON，fallthrough
  }
  return raw.slice(0, 300).replace(/\s+/g, ' ').trim();
}
