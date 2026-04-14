// Claude Agent SDK 的薄封装：把 Coase 的 runtime 选项、供应商配置、
// 自定义 MCP 工具、权限控制策略、plugin 路径组装成一个 query 调用。
//
// Phase 3 起：
//  - 多轮模式。prompt 是一个 PromptQueue（async iterable），上层可以
//    随时 push 新的用户消息，SDK 一个个消化，每条对应一个 agent turn。
//  - 不再硬塞 skill 内容做 systemPrompt。Skill 由两个 local plugin 注入
//    （coase-builtin + coase-user），SDK 原生的渐进式披露会把 skill 的
//    name + description 喂给 Claude，body 按需加载。

import {
  createSdkMcpServer,
  query,
  type Options,
  type PermissionResult,
  type Query,
} from '@anthropic-ai/claude-agent-sdk';

import { PromptQueue } from '../chat/prompt-queue';
import { resolveCoasePluginPaths } from '../skills/plugin-paths';
import { resolveActiveProvider, type ResolvedProvider } from '../providers/resolve';
import { rExecTool } from '../tools/r-exec';

/**
 * r_exec 作为 SDK MCP 工具暴露时，SDK 会把它包装成
 * `mcp__<serverName>__<toolName>` 的全名。下面这个常量保证
 * canUseTool 回调和 SDK 内部命名一致。
 */
const COASE_MCP_SERVER_NAME = 'coase';
const ALLOWED_TOOL_NAMES = new Set<string>([`mcp__${COASE_MCP_SERVER_NAME}__r_exec`]);

// Append 到 Claude Code 默认 preset 之后的 Coase 专用系统框架。
// 放在这里而不是某个 skill 文件里，因为：
//  - 它描述的是 "你现在运行在 Coase 里" 这件事本身，不属于任何具体研究步骤
//  - 任何 skill 被激活时这段都应该生效
//  - 用户在 skill 编辑器里能改各种 skill，但不应该能改 Coase 的身份定位
const COASE_SYSTEM_PROMPT_APPEND = `你现在运行在 Coase 桌面端里，这是一个面向经验经济学研究的多 skill 助手。

- 你的主要任务是帮用户从"研究主题"逐步推进到"baseline 设计 → 数据 → 分析 → 写作 → 审稿"。具体每一步怎么做，由对应的 skill（planner / datafetcher / analyst / writer / reviewer 等）自行规定——看到合适的 skill 就去激活它。
- Coase 自己只注入一个 MCP 工具 \`mcp__coase__r_exec\`，用于在用户本地执行 R 代码。文件读写、网络抓取等能力没有开放；当你想做这些事时，通过 r_exec 里的 R 代码实现。
- 所有自然语言输出默认用简体中文。方法论名词、代码、变量名可以保留英文。
- 运行期没有任何人类审批弹窗，权限检查被绕过（bypassPermissions），所以在调用 r_exec 前必须自己判断代码是否合理、是否会污染用户机器。写文件到 workspace 之外、删文件、调用 shell 都要先跟用户确认再动。
- 如果 \`r_exec\` 返回 \`oom_detected: true\` 或 \`timed_out: true\`，立即停止重试并向用户报告，不要盲目换参数重跑。`;

export interface ChatQueryParams {
  queue: PromptQueue;
  signal?: AbortSignal;
}

export interface ChatQueryBundle {
  query: Query;
  provider: ResolvedProvider;
}

/**
 * 建立一次多轮 chat 会话。返回 SDK 的 Query 对象 + 当前解析出的 provider。
 *
 * 调用方需要自己维护 queue：首条用户消息通过 queue.push(...) 发起，后续用户
 * 继续 push；用户结束会话时调用 queue.end() 让 SDK 退出循环。Abort 走 signal。
 *
 * 函数本身是 async —— 需要先从 providers.json / env 解析 provider，再解析
 * plugin 路径（顺带初始化 user plugin 骨架），都涉及磁盘 I/O。
 */
export async function createChatQuery({ queue, signal }: ChatQueryParams): Promise<ChatQueryBundle> {
  const provider = await resolveActiveProvider();
  const pluginPaths = await resolveCoasePluginPaths();

  const coaseMcp = createSdkMcpServer({
    name: COASE_MCP_SERVER_NAME,
    version: '0.1.0',
    tools: [rExecTool],
  });

  const abortController = new AbortController();
  if (signal) {
    if (signal.aborted) abortController.abort();
    else signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> => {
    if (ALLOWED_TOOL_NAMES.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }
    return {
      behavior: 'deny',
      message: `Coase 只开放 r_exec，拒绝 ${toolName}`,
      interrupt: false,
    };
  };

  // 构造传给 SDK cli.js 子进程的环境变量。
  // 关键：两个鉴权变量互斥，所以先把两个都清掉，再按 provider.authMode 注入需要的那个，
  // 避免 host 环境里同时存在 API_KEY 和 AUTH_TOKEN 导致 CLI 冲突报错。
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY;
  delete childEnv.ANTHROPIC_AUTH_TOKEN;
  if (provider.authMode === 'api_key') {
    childEnv.ANTHROPIC_API_KEY = provider.credential;
  } else {
    childEnv.ANTHROPIC_AUTH_TOKEN = provider.credential;
  }
  if (provider.baseURL) childEnv.ANTHROPIC_BASE_URL = provider.baseURL;
  // 对齐 MiniMax 文档建议：给一个长超时 + 关闭非必要遥测流量
  childEnv.API_TIMEOUT_MS = childEnv.API_TIMEOUT_MS ?? '3000000';
  childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
    childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1';

  const options: Options = {
    abortController,
    // 沿用 Claude Code 默认 preset，让 SDK 内置的 skill 列表注入、渐进式披露、
    // 进度提示等机制保持原样；Coase 自己的框架补充用 append 塞进去。
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: COASE_SYSTEM_PROMPT_APPEND,
    },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    // 不加载任何文件系统 settings / CLAUDE.md，SDK 工作在隔离模式
    settingSources: [],
    // 禁用所有内建工具，只通过 MCP 暴露我们自己的 r_exec
    tools: [],
    mcpServers: { [COASE_MCP_SERVER_NAME]: coaseMcp },
    // Skill 通过两个 local plugin 注入：内置只读 + 用户可编辑。
    // SDK 会自动发现两个目录下 skills/<name>/SKILL.md，按 1% 上下文预算
    // 把 name+description 列入 skill listing，body 在 Claude 调用时才加载。
    plugins: [
      { type: 'local', path: pluginPaths.builtin },
      { type: 'local', path: pluginPaths.user },
    ],
    model: provider.model,
    // 系统 node 执行 SDK 自带的 cli.js，避免 Electron 宿主进程污染
    executable: 'node',
    // 多轮 chat 下，maxTurns 是累计的 agent round-trip 上限，上到 200 给复杂
    // 研究任务留空间；单次 chat:start 超过这个会被 SDK 内部中止。
    maxTurns: 200,
    env: childEnv,
    canUseTool,
  };

  return { query: query({ prompt: queue, options }), provider };
}
