// 本地 anthropic 反向代理。
//
// 起因：Claude Agent SDK 内部 cli.js 在构造 /v1/messages 请求时会拦截
// `Settings.thinking = { type: 'disabled' }` —— 它把 disabled 作为"不发 thinking
// 字段"处理，导致我们没法主动告诉 Moonshot Kimi K2.6 / DeepSeek V4 等第三方
// anthropic 兼容端点"关掉思考模式"。
//
// 解决：在 main process 起一个 loopback HTTP 服务器，把 ANTHROPIC_BASE_URL
// 改成指向它；它再转发到真实上游，转发途中如果该路由标了 disableThinking=true，
// 就在 /v1/messages 的 JSON body 里强行注入 `thinking: { type: 'disabled' }`。
//
// 路由表：每个 provider 启动 SDK query 前调用 setRoute(providerId, ...)，把
// 真实 upstream + 是否禁思考写进来。SDK cli.js 看到的 base URL 是
// `http://127.0.0.1:<port>/<providerId>`；它发请求时拼成
// `http://127.0.0.1:<port>/<providerId>/v1/messages`，本服务剥掉前缀转发。
//
// SSE 流式透传：upstream 的 response 直接 pipe 回原 response，不缓冲。
// 仅 request body 会被读进内存（messages.create 通常 <几 MB，可接受）。

import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';

interface RouteEntry {
  /** 真实上游 base URL，如 https://api.deepseek.com/anthropic */
  upstream: string;
  /** 是否在 /v1/messages 请求里强行注入 thinking={type:'disabled'} */
  disableThinking: boolean;
}

let server: Server | null = null;
let listenPort = 0;
const routes = new Map<string, RouteEntry>();

export function setRoute(routeId: string, entry: RouteEntry): void {
  routes.set(routeId, entry);
}

export function clearRoute(routeId: string): void {
  routes.delete(routeId);
}

export function isProxyRunning(): boolean {
  return server !== null && listenPort > 0;
}

export function getProxyPort(): number {
  return listenPort;
}

/**
 * 启动代理。重复调用是 no-op。
 * 监听 127.0.0.1:0，由系统分配端口；端口存到 listenPort，外部用 getProxyPort 读。
 */
export async function startAnthropicProxy(): Promise<number> {
  if (server) return listenPort;
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.warn('[anthropic-proxy] handler error:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(`anthropic-proxy internal error: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          try {
            res.end();
          } catch {
            /* noop */
          }
        }
      });
    });
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        server = s;
        listenPort = addr.port;
        console.info(`[anthropic-proxy] listening on 127.0.0.1:${listenPort}`);
        resolve(listenPort);
      } else {
        reject(new Error('anthropic-proxy: listen returned non-object address'));
      }
    });
  });
}

export async function stopAnthropicProxy(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server!.close(() => resolve());
  });
  server = null;
  listenPort = 0;
  routes.clear();
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawUrl = req.url ?? '/';
  // path 形式: /<routeId>/<rest...>
  const match = rawUrl.match(/^\/([^/?#]+)(\/.*)?$/);
  if (!match) {
    res.statusCode = 404;
    res.end('anthropic-proxy: bad path');
    return;
  }
  const routeId = decodeURIComponent(match[1]);
  const rest = match[2] || '/';
  const entry = routes.get(routeId);
  if (!entry) {
    res.statusCode = 404;
    res.end(`anthropic-proxy: route ${routeId} not configured`);
    return;
  }

  // 把 rest 拼到 upstream 后面，得到真实 URL。upstream 已含路径前缀（如
  // /anthropic）就直接 concat；不会引入双斜杠（rest 必以 / 开头，upstream
  // 不以 / 结尾——presets 里手写的 baseURL 都是这样）。
  const upstreamBase = entry.upstream.replace(/\/+$/, '');
  const targetUrl = new URL(upstreamBase + rest);

  // body 必须缓冲——因为可能要 parse 改字段。messages.create 请求 body 通常
  // 不会很大（几 MB 内），可以一次性读完再转发。
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  let body: Buffer = Buffer.concat(chunks);

  // 仅对 POST /v1/messages（含 query string）改写 body。stream / non-stream 都生效。
  const isMessagesPath = /^\/v1\/messages(\?|$|\/)/.test(rest);
  if (
    entry.disableThinking &&
    isMessagesPath &&
    (req.method ?? '').toUpperCase() === 'POST' &&
    body.length > 0
  ) {
    try {
      const json = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
      // 强行覆盖：用户/SDK 传了什么都不管，统一禁思考。
      json.thinking = { type: 'disabled' };
      body = Buffer.from(JSON.stringify(json), 'utf8');
    } catch (err) {
      console.warn(
        `[anthropic-proxy] body JSON parse failed for ${routeId}; forwarding as-is:`,
        err,
      );
    }
  }

  const isHttps = targetUrl.protocol === 'https:';
  const reqFn = isHttps ? httpsRequest : httpRequest;

  // 复制 headers，但要：
  //   - 重设 host 为上游
  //   - 重算 content-length（body 可能被改写）
  //   - 干掉 accept-encoding：避免上游 gzip，简化流式透传逻辑（SSE 通常不压缩，
  //     但有些上游可能压 plain JSON 响应——禁掉省去解压再 pipe 的麻烦）
  const upstreamHeaders: IncomingHttpHeaders = { ...req.headers };
  upstreamHeaders.host = targetUrl.host;
  delete upstreamHeaders['content-length'];
  delete upstreamHeaders['accept-encoding'];
  if (body.length > 0) {
    upstreamHeaders['content-length'] = String(body.length);
  }

  const upstreamReq = reqFn({
    method: req.method,
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: upstreamHeaders,
  });

  upstreamReq.on('response', (upstreamRes) => {
    res.statusCode = upstreamRes.statusCode ?? 502;
    for (const [name, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) continue;
      try {
        res.setHeader(name, value as string | string[]);
      } catch {
        /* 某些 header 名带保留字符会被 setHeader 拒，跳过即可 */
      }
    }
    upstreamRes.pipe(res);
    upstreamRes.on('error', (err) => {
      console.warn('[anthropic-proxy] upstream stream error:', err);
      try {
        res.end();
      } catch {
        /* noop */
      }
    });
  });

  upstreamReq.on('error', (err) => {
    console.warn('[anthropic-proxy] upstream request error:', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end(`anthropic-proxy upstream error: ${err.message}`);
    } else {
      try {
        res.end();
      } catch {
        /* noop */
      }
    }
  });

  // 客户端中途断开时同步取消上游请求，避免 socket 泄漏。
  req.on('close', () => {
    if (!upstreamReq.destroyed) upstreamReq.destroy();
  });

  if (body.length > 0) upstreamReq.write(body);
  upstreamReq.end();
}
