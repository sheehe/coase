import {
  query,
  type AgentDefinition,
  type HookCallbackMatcher,
  type Options,
  type PostToolUseFailureHookInput,
  type Query,
  type Settings,
  type SubagentStopHookInput,
} from '@anthropic-ai/claude-agent-sdk';
import { app } from 'electron';
import { join } from 'node:path';

import { PromptQueue } from '../chat/prompt-queue';
import { resolveActiveProvider, type ResolvedProvider } from '../providers/resolve';
import { resolveCoasePluginPaths } from '../skills/plugin-paths';

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

const COASE_SYSTEM_PROMPT_APPEND = `
你正在 Coase 桌面应用中工作。这是一个面向经济学与社会科学实证研究的研究工作台。

- 默认使用简体中文输出；方法术语、代码、变量名和模型名可以保留英文。
- 你拥有 Claude Code / Agent SDK 的内建工具能力，可按任务需要自由使用读取、搜索、编辑、命令行、联网等工具。
- Coase 直接加载了一整套 econometrics plugin skills。请按任务需要主动使用 data-fetcher、data-cleaning、did-analysis、iv-estimation、panel-data、paper-writing、table、figure、stats、time-series、synthetic-control、ml-causal、literature-review 等技能。
- 特别注意：planner、datafetcher、analyst、writer、reviewer 现在只是 Coase 的工作阶段名称，不是可调用的 skill 名。不要把这些阶段名当作 skill 去调用。
- Coase 的工作流是软编排：研究规划、数据准备、分析、写作、审校只是工作模式，不是硬状态机。你应根据研究进展自主切换合适技能。
- 你可以在需要时调用合适的 sub-agent 处理局部任务，但主线程必须保留研究主线与最终整合责任。
- 当前运行环境默认绕过权限弹窗，因此在执行破坏性文件操作、跨 workspace 写入、批量修改或高风险 shell 命令前，必须先自我审慎评估，并在必要时向用户确认。
`.trim();

const COASE_AGENTS: Record<string, AgentDefinition> = {
  research_planner: {
    description:
      '负责研究问题澄清、文献定位、方法选择、识别策略设计与研究路线收敛。',
    prompt:
      '你是 Coase 的研究规划子代理。优先使用 literature-review 与各类方法技能，完成问题澄清、文献定位、方法筛选、识别假设梳理和研究路线收敛。不要把阶段名误当作 skill 名。',
    skills: [
      'literature-review',
      'ols-regression',
      'panel-data',
      'iv-estimation',
      'did-analysis',
      'rdd-analysis',
      'synthetic-control',
      'time-series',
      'ml-causal',
      'stats',
    ],
    model: 'inherit',
    maxTurns: 32,
  },
  data_prep: {
    description:
      '负责数据源定位、抓取、清洗、合并、变量构造与分析样本准备。',
    prompt:
      '你是 Coase 的数据准备子代理。优先使用 data-fetcher 与 data-cleaning 技能，完成数据来源选择、抓取、合并、清洗、样本构造与质量检查。不要把阶段名误当作 skill 名。',
    skills: ['data-fetcher', 'data-cleaning'],
    model: 'inherit',
    maxTurns: 32,
  },
  empirical_analyst: {
    description:
      '负责主回归、稳健性、机制、异质性、统计诊断、表格与图形输出。',
    prompt:
      '你是 Coase 的实证分析子代理。根据研究问题选择最合适的 econometrics skill，完成 baseline 估计、扩展检验、描述统计、表格与图形输出。不要把阶段名误当作 skill 名。',
    skills: [
      'ols-regression',
      'panel-data',
      'iv-estimation',
      'did-analysis',
      'rdd-analysis',
      'synthetic-control',
      'time-series',
      'ml-causal',
      'stats',
      'table',
      'figure',
    ],
    model: 'inherit',
    maxTurns: 48,
  },
  paper_drafter: {
    description:
      '负责将研究结果组织成论文结构、结果段落、图表说明与可投稿草稿。',
    prompt:
      '你是 Coase 的论文写作子代理。优先使用 paper-writing 技能；需要排版或输出展示材料时，可结合 table、figure、beamer-ppt 技能。不要把阶段名误当作 skill 名。',
    skills: ['paper-writing', 'table', 'figure', 'beamer-ppt'],
    model: 'inherit',
    maxTurns: 32,
  },
  quality_reviewer: {
    description:
      '负责从设计、执行、写作和证据一致性角度做对抗式质量复核。',
    prompt:
      '你是 Coase 的质量复核子代理。利用 econometrics plugin skills 中的方法规范、表图规范、写作规范和文献定位能力，对当前研究产出进行对抗式复核并给出具体修订意见。不要把阶段名误当作 skill 名。',
    skills: [
      'literature-review',
      'paper-writing',
      'stats',
      'table',
      'figure',
      'ols-regression',
      'panel-data',
      'iv-estimation',
      'did-analysis',
      'rdd-analysis',
      'synthetic-control',
      'time-series',
      'ml-causal',
      'data-cleaning',
    ],
    model: 'inherit',
    maxTurns: 32,
  },
};

const COASE_HOOKS: Partial<Record<string, HookCallbackMatcher[]>> = {
  PostToolUseFailure: [
    {
      hooks: [
        async (input) => {
          const failure = input as PostToolUseFailureHookInput;
          return {
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'PostToolUseFailure',
              additionalContext: `工具 ${failure.tool_name} 刚刚失败。先理解失败原因，再决定是否重试；不要机械重复同一失败调用。必要时切换工具、缩小范围或调整方案。`,
            },
          };
        },
      ],
    },
  ],
  SubagentStart: [
    {
      hooks: [
        async (input) => ({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: `你正在启动子代理 ${input.agent_type}。请让它聚焦局部问题，返回可整合的结论、关键证据与文件路径，不要让它偏离主研究目标。`,
          },
        }),
      ],
    },
  ],
  SubagentStop: [
    {
      hooks: [
        async (input) => {
          const subagent = input as SubagentStopHookInput;
          return {
            continue: true,
            systemMessage: subagent.last_assistant_message?.trim()
              ? `子代理 ${subagent.agent_type} 已结束。其最后摘要为：${subagent.last_assistant_message.trim()}`
              : `子代理 ${subagent.agent_type} 已结束，请将其产出整合回主研究主线。`,
          };
        },
      ],
    },
  ],
};

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
  const pluginPaths = await resolveCoasePluginPaths();

  const abortController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY;
  delete childEnv.ANTHROPIC_AUTH_TOKEN;

  if (provider.authMode === 'api_key') {
    childEnv.ANTHROPIC_API_KEY = provider.credential;
  } else {
    childEnv.ANTHROPIC_AUTH_TOKEN = provider.credential;
  }

  if (provider.baseURL) {
    childEnv.ANTHROPIC_BASE_URL = provider.baseURL;
  }

  childEnv.API_TIMEOUT_MS = childEnv.API_TIMEOUT_MS ?? '3000000';
  childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
    childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1';
  childEnv.CLAUDE_AGENT_SDK_CLIENT_APP = childEnv.CLAUDE_AGENT_SDK_CLIENT_APP ?? 'coase-desktop';

  // 把自动压缩阈值喂给 SDK 的 flag settings 层（优先级最高）。这样 cli.js 内部
  // 的 auto-compact 检查会走我们指定的 token 阈值，而不是 SDK 自己挑默认值。
  // 优先级：provider 设置页里填的数字 > 按 model 自适应的默认。
  const flagSettings: Settings = {
    autoCompactWindow: provider.autoCompactWindow ?? pickAutoCompactWindow(provider.model),
  };

  const options: Options = {
    abortController,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: COASE_SYSTEM_PROMPT_APPEND,
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
    hooks: COASE_HOOKS,
    includeHookEvents: true,
    agentProgressSummaries: true,
    promptSuggestions: true,
    agents: COASE_AGENTS,
    model: provider.model,
    executable: 'node',
    pathToClaudeCodeExecutable: CLAUDE_CODE_CLI_PATH,
    cwd,
    maxTurns: 200,
    env: childEnv,
    stderr: onStderr,
    ...(resume ? { resume } : {}),
  };

  return { query: query({ prompt: queue, options }), provider };
}
