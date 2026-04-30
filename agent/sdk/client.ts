import {
  query,
  type Options,
  type Query,
  type Settings,
} from '@anthropic-ai/claude-agent-sdk';
import { app } from 'electron';
import { join } from 'node:path';

import { getProxyPort, isProxyRunning, setRoute } from '../proxy/anthropic-proxy';
import { loadAppPrefs, resolveAppLanguage } from '../app/prefs-store';
import { PromptQueue } from '../chat/prompt-queue';
import { resolveActiveProvider, type ResolvedProvider } from '../providers/resolve';
import { loadResearchPrefs, renderResearchPrefsForPrompt } from '../research/prefs-store';
import { buildRuntimeEnv } from '../runtime';
import { resolveCoaseSdkPluginPaths } from '../skills/plugin-paths';
import { getCoaseAgents, getCoaseHooks } from './agent-definitions';
import { buildCriticPanelMcpServer } from './critic-panel-mcp';
import { getCoaseSystemPromptBase } from './system-prompts';

// 不要用 require.resolve('@anthropic-ai/claude-agent-sdk') 去定位 cli.js：
// 1. SDK 的 package.json exports 只开放了 '.' / './embed' 等子路径，没有 './package.json'，
//    asar 内解析 ESM 包时会触发 ERR_PACKAGE_PATH_NOT_EXPORTED；
// 2. pnpm 的符号链接在 electron-builder 打包进 asar 后不稳定。
//
// 打包后 app.getAppPath() 指向 .../resources/app.asar。SDK 通过 spawn 拉起独立 Node
// 子进程执行 cli.js，而 Node 本身不认识 asar，只 Electron 认。所以必须把路径
// 重定向到 asar.unpacked（SDK 已经通过 build.asarUnpack 被解出来）。dev 模式下
// app.getAppPath() 是项目根，replace 是 no-op。
const RESOLVED_APP_PATH = app.getAppPath().replace(
  /([\\/])app\.asar([\\/])/,
  '$1app.asar.unpacked$2',
).replace(
  /([\\/])app\.asar$/,
  '$1app.asar.unpacked',
);
const CLAUDE_AGENT_SDK_DIR = join(
  RESOLVED_APP_PATH,
  'node_modules',
  '@anthropic-ai',
  'claude-agent-sdk',
);
const CLAUDE_CODE_CLI_PATH = join(CLAUDE_AGENT_SDK_DIR, 'cli.js');

// 根据 model 决定 SDK 自动压缩阈值（token 数）。
//
// Claude Agent SDK 的 `autoCompactWindow` 是 token 阈值：当累计 token 逼近这个
// 值时，SDK 会在主循环里自动触发 compact（走 CLI 的 auto-compact 通道，产出
// compact_boundary system message 并把老消息折叠成摘要）。合法范围 100k–1M。
//
// 默认 160k（≈ 200k 窗口模型的 80%），为 Opus 4.6 [1m] 等 1M 窗口模型单独拉到
// 850k 以避免无谓的早压缩——这些模型之所以被选就是为了吃满大窗口。
function pickAutoCompactWindow(model: string): number {
  const normalized = model.toLowerCase();
  if (
    normalized.includes('[1m]') ||
    normalized.includes('-1m') ||
    normalized.includes('_1m')
  ) {
    return 850_000;
  }
  return 160_000;
}

export interface ChatQueryParams {
  queue: PromptQueue;
  signal?: AbortSignal;
  resume?: string;
  cwd?: string;
  onStderr?: (data: string) => void;
}

export interface ChatQueryBundle {
  query: Query;
  provider: ResolvedProvider;
}

export async function createChatQuery({
  queue,
  signal,
  resume,
  cwd,
  onStderr,
}: ChatQueryParams): Promise<ChatQueryBundle> {
  const provider = await resolveActiveProvider();
  const researchPrefs = await loadResearchPrefs();
  const language = resolveAppLanguage(await loadAppPrefs());
  const pluginPaths = await resolveCoaseSdkPluginPaths(language);
  const systemPromptAppend = [
    getCoaseSystemPromptBase(language),
    '',
    renderResearchPrefsForPrompt(researchPrefs, language),
  ].join('\n');

  const abortController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
  }

  // buildRuntimeEnv 会把 <userData>/runtime/.pixi/envs/default 的 bin 前插到 PATH，
  // 并设 CONDA_PREFIX。这样 agent 的 Bash 工具里直接 `Rscript foo.R` / `python foo.py`
  // 就能命中 Coase 自带的 R + Python 环境，不依赖用户机器上的 R/Python 安装。
  // 环境尚未解出时 no-op，agent 正常启动（只是 R/Python 命令会 ENOENT）。
  const childEnv: NodeJS.ProcessEnv = buildRuntimeEnv();
  delete childEnv.ANTHROPIC_API_KEY;
  delete childEnv.ANTHROPIC_AUTH_TOKEN;

  if (provider.authMode === 'api_key') {
    childEnv.ANTHROPIC_API_KEY = provider.credential;
  } else {
    childEnv.ANTHROPIC_AUTH_TOKEN = provider.credential;
  }

  // Provider 标了 disableThinking 时把 base URL 重定向到本地反向代理，由代理
  // 在 /v1/messages body 里强行注入 thinking={type:'disabled'} 再转发——绕开
  // SDK cli.js 对 thinking 字段的过滤。代理未启动 / 没有 providerId（env source）
  // 时回退到原 baseURL，功能失效但 chat 仍然能用。
  const proxyPort = getProxyPort();
  const useProxy =
    provider.disableThinking === true &&
    isProxyRunning() &&
    proxyPort > 0 &&
    typeof provider.providerId === 'string' &&
    provider.providerId.length > 0;

  if (useProxy) {
    setRoute(provider.providerId!, {
      upstream: provider.baseURL || 'https://api.anthropic.com',
      disableThinking: true,
    });
    childEnv.ANTHROPIC_BASE_URL = `http://127.0.0.1:${proxyPort}/${provider.providerId}`;
  } else if (provider.baseURL) {
    childEnv.ANTHROPIC_BASE_URL = provider.baseURL;
  }

  childEnv.API_TIMEOUT_MS = childEnv.API_TIMEOUT_MS ?? '3000000';
  childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
    childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1';
  childEnv.CLAUDE_AGENT_SDK_CLIENT_APP = childEnv.CLAUDE_AGENT_SDK_CLIENT_APP ?? 'coase-desktop';

  // Electron 二进制本身就是一个 Node 运行时，开 ELECTRON_RUN_AS_NODE=1 就会把
  // 子进程当纯 Node 跑。传 executable:'node' 会让 SDK 去 PATH 里找 node，
  // 但 macOS GUI 启动的进程默认 PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，
  // brew / nvm 装的 node 全部看不到 → spawn ENOENT → SDK 报误导性的
  // "Claude Code executable not found at cli.js"。用 process.execPath 绕开
  // 整个外部 Node 依赖，用户不装 Node 也能跑。
  childEnv.ELECTRON_RUN_AS_NODE = '1';

  // 把自动压缩阈值喂给 SDK 的 flag settings 层（优先级最高）。这样 cli.js 内部
  // 的 auto-compact 检查会走我们指定的 token 阈值，而不是 SDK 自己挑默认值。
  // 优先级：provider 设置页里填的数字 > 按 model 自适应的默认。
  //
  // 注意：disableThinking 不能通过 Settings.thinking={type:'disabled'} 实现——
  // cli.js 拿到 type:'disabled' 后会**整体丢弃** thinking 字段（变成 undefined），
  // 不会把它发到第三方端点。改成走 anthropic-proxy 在 HTTP body 里强行注入。
  const flagSettings: Settings = {
    autoCompactWindow: provider.autoCompactWindow ?? pickAutoCompactWindow(provider.model),
  };

  const options: Options = {
    abortController,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: systemPromptAppend,
    },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settings: flagSettings,
    settingSources: ['project'],
    tools: { type: 'preset', preset: 'claude_code' },
    plugins: [
      { type: 'local', path: pluginPaths.builtin },
      { type: 'local', path: pluginPaths.user },
    ],
    mcpServers: {
      'coase-critic-panel': buildCriticPanelMcpServer(),
    },
    hooks: getCoaseHooks(language),
    includeHookEvents: true,
    agentProgressSummaries: true,
    promptSuggestions: true,
    agents: getCoaseAgents(language),
    model: provider.model,
    executable: process.execPath as 'node',
    pathToClaudeCodeExecutable: CLAUDE_CODE_CLI_PATH,
    cwd,
    maxTurns: 200,
    env: childEnv,
    stderr: onStderr,
    ...(resume ? { resume } : {}),
  };

  return { query: query({ prompt: queue, options }), provider };
}
