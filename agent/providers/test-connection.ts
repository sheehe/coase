// 测试一个 provider 能不能正常通到 /v1/messages。
//
// 走 Node fetch（main process）而不是 renderer fetch，
// 避开 Chromium 的 CORS 限制——第三方厂商几乎都没设 CORS 响应头。
//
// 实际打一个 max_tokens=1 的最小 messages 请求，成本接近零。

import type { ProviderRecord, TestConnectionResult } from '../../shared/providers';

const TIMEOUT_MS = 10_000;

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
  if (!record.baseURL) {
    return { ok: false, latencyMs: 0, message: 'baseURL 为空' };
  }
  if (!record.credential) {
    return { ok: false, latencyMs: 0, message: 'API key / token 为空' };
  }
  if (!record.model) {
    return { ok: false, latencyMs: 0, message: 'model 为空' };
  }

  // 规范化 URL：baseURL + '/v1/messages'
  // 用户可能输入 https://foo.com/anthropic 或 https://foo.com/anthropic/
  const normalized = record.baseURL.replace(/\/+$/, '');
  const fullUrl = `${normalized}/v1/messages`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (record.authMode === 'api_key') {
    headers['x-api-key'] = record.credential;
  } else {
    headers['authorization'] = `Bearer ${record.credential}`;
  }

  const body = JSON.stringify({
    model: record.model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
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

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        latencyMs,
        message: `连接成功 · HTTP ${res.status} · ${latencyMs}ms`,
      };
    }

    // 尽可能把服务器报错的前 300 字符带回去
    let detail = '';
    try {
      const text = await res.text();
      detail = text.replace(/\s+/g, ' ').slice(0, 300);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      message: `HTTP ${res.status}${detail ? ' · ' + detail : ''}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        ok: false,
        latencyMs,
        message: `请求超时 (> ${TIMEOUT_MS / 1000}s)`,
      };
    }
    return {
      ok: false,
      latencyMs,
      message: `网络错误：${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
