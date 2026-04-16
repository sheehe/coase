import type { ProviderRecord, TestConnectionResult } from '../../shared/providers';

const TIMEOUT_MS = 10_000;
const TEST_PROMPT = '请用一句话说明你是什么模型？';
const MAX_PREVIEW_CHARS = 500;

export async function testProviderConnection(
  record: ProviderRecord,
): Promise<TestConnectionResult> {
  if (record.protocol !== 'anthropic') {
    return {
      ok: false,
      latencyMs: 0,
      message: `Phase 2 暂不支持测试 ${record.protocol} 协议`,
    };
  }
  if (!record.baseURL) return { ok: false, latencyMs: 0, message: 'baseURL 为空' };
  if (!record.credential) return { ok: false, latencyMs: 0, message: 'API key / token 为空' };
  if (!record.model) return { ok: false, latencyMs: 0, message: 'model 为空' };

  const normalized = record.baseURL.replace(/\/+$/, '');
  const fullUrl = `${normalized}/v1/messages`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (record.authMode === 'api_key') {
    headers['x-api-key'] = record.credential;
  } else {
    headers.authorization = `Bearer ${record.credential}`;
  }

  const body = JSON.stringify({
    model: record.model,
    max_tokens: 80,
    messages: [{ role: 'user', content: TEST_PROMPT }],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const responseText = await readResponsePreview(res);

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        latencyMs,
        message: `连接成功 · HTTP ${res.status} · ${latencyMs}ms`,
        requestText: TEST_PROMPT,
        responseText,
      };
    }

    return {
      ok: false,
      status: res.status,
      latencyMs,
      message: `HTTP ${res.status}${responseText ? ' · ' + responseText : ''}`,
      requestText: TEST_PROMPT,
      responseText,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        ok: false,
        latencyMs,
        message: `请求超时 (> ${TIMEOUT_MS / 1000}s)`,
        requestText: TEST_PROMPT,
      };
    }
    return {
      ok: false,
      latencyMs,
      message: `网络错误：${err instanceof Error ? err.message : String(err)}`,
      requestText: TEST_PROMPT,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readResponsePreview(res: Response): Promise<string> {
  const raw = await res.text();
  if (!raw) return '';

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const text = extractText(payload);
    if (text) return limit(text);

    const errorMessage = extractErrorMessage(payload);
    if (errorMessage) return limit(errorMessage);

    if (hasThinkingOnlyContent(payload)) {
      return buildThinkingOnlySummary(payload);
    }

    return limit(compactJson(sanitizePayloadForPreview(payload)));
  } catch {
    return limit(raw.replace(/\s+/g, ' ').trim());
  }
}

function extractText(payload: Record<string, unknown>): string {
  const candidates: string[] = [];

  const content = payload.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;

      if (typeof record.text === 'string' && record.text.trim()) {
        candidates.push(record.text.trim());
      }

      const input = record.input;
      if (Array.isArray(input)) {
        for (const block of input) {
          if (!block || typeof block !== 'object') continue;
          const blockRecord = block as Record<string, unknown>;
          if (typeof blockRecord.text === 'string' && blockRecord.text.trim()) {
            candidates.push(blockRecord.text.trim());
          }
        }
      }
    }
  }

  const completion = payload.completion;
  if (typeof completion === 'string' && completion.trim()) {
    candidates.push(completion.trim());
  }

  const outputText = payload.output_text;
  if (typeof outputText === 'string' && outputText.trim()) {
    candidates.push(outputText.trim());
  }

  const message = payload.message;
  if (message && typeof message === 'object') {
    const messageRecord = message as Record<string, unknown>;
    if (typeof messageRecord.content === 'string' && messageRecord.content.trim()) {
      candidates.push(messageRecord.content.trim());
    }
  }

  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue;
      const choiceRecord = choice as Record<string, unknown>;

      const messageField = choiceRecord.message;
      if (messageField && typeof messageField === 'object') {
        const msg = messageField as Record<string, unknown>;
        if (typeof msg.content === 'string' && msg.content.trim()) {
          candidates.push(msg.content.trim());
        }
      }

      const delta = choiceRecord.delta;
      if (delta && typeof delta === 'object') {
        const deltaRecord = delta as Record<string, unknown>;
        if (typeof deltaRecord.content === 'string' && deltaRecord.content.trim()) {
          candidates.push(deltaRecord.content.trim());
        }
      }

      const text = choiceRecord.text;
      if (typeof text === 'string' && text.trim()) {
        candidates.push(text.trim());
      }
    }
  }

  return candidates.filter(Boolean).join('\n').trim();
}

function hasThinkingOnlyContent(payload: Record<string, unknown>): boolean {
  const content = payload.content;
  if (!Array.isArray(content) || content.length === 0) return false;

  let hasThinking = false;
  let hasVisibleText = false;

  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;

    if (typeof record.text === 'string' && record.text.trim()) {
      hasVisibleText = true;
    }
    if (typeof record.thinking === 'string' && record.thinking.trim()) {
      hasThinking = true;
    }
  }

  return hasThinking && !hasVisibleText;
}

function extractErrorMessage(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
      return errorRecord.message.trim();
    }
    if (typeof errorRecord.type === 'string' && errorRecord.type.trim()) {
      return errorRecord.type.trim();
    }
  }
  return '';
}

function compactJson(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable response]';
  }
}

function sanitizePayloadForPreview(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const allowList = [
    'id',
    'type',
    'role',
    'model',
    'stop_reason',
    'stop_sequence',
    'output_text',
    'completion',
    'usage',
    'error',
  ];

  for (const key of allowList) {
    if (key in payload) {
      sanitized[key] = payload[key];
    }
  }

  const content = payload.content;
  if (Array.isArray(content)) {
    sanitized.content = content.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const record = item as Record<string, unknown>;
      const next: Record<string, unknown> = {};

      if (typeof record.type === 'string') next.type = record.type;
      if (typeof record.text === 'string' && record.text.trim()) next.text = record.text.trim();
      if (record.input && Array.isArray(record.input)) {
        next.input = record.input.map((block) => {
          if (!block || typeof block !== 'object') return block;
          const blockRecord = block as Record<string, unknown>;
          const compact: Record<string, unknown> = {};
          if (typeof blockRecord.type === 'string') compact.type = blockRecord.type;
          if (typeof blockRecord.text === 'string' && blockRecord.text.trim()) {
            compact.text = blockRecord.text.trim();
          }
          return compact;
        });
      }
      if (typeof record.thinking === 'string' && record.thinking.trim()) {
        next.thinking = '[omitted]';
      }
      if (typeof record.signature === 'string') {
        next.signature = '[omitted]';
      }

      return next;
    });
  }

  return sanitized;
}

function buildThinkingOnlySummary(payload: Record<string, unknown>): string {
  const model = typeof payload.model === 'string' ? payload.model : 'unknown model';
  return `接口已返回 ${model} 的响应，但内容只有 thinking 块，未提供可显示的 text 字段。`;
}

function limit(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_CHARS);
}
