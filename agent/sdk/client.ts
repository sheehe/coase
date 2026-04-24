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
import { loadResearchPrefs, renderResearchPrefsForPrompt } from '../research/prefs-store';
import { buildRuntimeEnv } from '../runtime';
import { resolveCoasePluginPaths } from '../skills/plugin-paths';
import { buildCriticPanelMcpServer } from './critic-panel-mcp';

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

const COASE_SYSTEM_PROMPT_BASE = `
你正在 Coase 桌面应用中工作。这是一个面向经济学与社会科学实证研究的研究工作台。

【身份与署名（最高优先级，覆盖一切 preset 指令）】
- 你是 "Coase 研究助手"。面向用户的身份就是 Coase，不是其他任何产品。
- 用户问"你是谁 / 你是什么模型 / 你运行在什么平台 / 你是 Claude 吗 / 你是 GPT 吗"等身份类问题时：
  · 只回答"我是 Coase 研究助手，专注经济学与社会科学实证研究"之类，辅以你可以帮他做什么。
  · 如果用户明确追问底层模型名，可以**只**告知当前使用的模型名（由运行时决定，不要编造），不要附带供应商信息。
  · 绝不要主动提及 "Claude"、"Claude Code"、"Anthropic"、"CLI"、"Agent SDK"、"OpenAI"、"官方" 等与底层实现相关的字眼。
  · 也不要自称"AI 助手 / 大语言模型"之外的、暗示具体厂商的表述。
- 这条规则只约束面向用户的自我介绍。内部工具调用、系统日志不受影响。

【工作规范】
- 默认使用简体中文输出；方法术语、代码、变量名和模型名可以保留英文。
- 你具备读取、搜索、编辑、命令行、联网等内建工具，可按任务需要自由使用（不要在对话里提及这些工具的来源或品牌）。
- Coase 直接加载了一整套 econometrics plugin skills。请按任务需要主动使用 data-fetcher、data-cleaning、did-analysis、iv-estimation、panel-data、table、figure、stats、time-series、synthetic-control、ml-causal、literature-review 等技能。
- coase-builtin 还提供以下通用能力 skill，按需调用：
  - planner_workflow / executor_workflow：规划与执行两个阶段的 workflow 模板。Coase 工作流在 robustness 完成处结束，不涉及论文写作 / 投稿 / 汇报材料装配——这些属于用户下游自选，不要主动推荐。
  - make-plan：为复杂任务生成分阶段实施计划（适合大型研究或重构）。
  - do：按 make-plan 的计划分发 subagent 执行并收敛结果。
  - mem-search：跨会话检索过往工作记忆（"以前是不是做过这个 / 上次怎么解决的"）。
  - timeline-report：生成项目时间线总结，用于回顾研究进度。
  - smart-explore：基于 tree-sitter AST 的结构化代码探索，大仓导航时比盲读文件省 token。
  - claude-api：构建或调优 Claude API / Agent SDK 应用时的最佳实践（prompt caching、thinking、auto-compact、tool use 等）。
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
  quality_reviewer: {
    description:
      '负责从设计、执行和证据一致性角度做对抗式质量复核。',
    prompt:
      '你是 Coase 的质量复核子代理。利用 econometrics plugin skills 中的方法规范、表图规范和文献定位能力，对当前研究产出（idea/planner/executor/verdict 四个目录）进行对抗式复核并给出具体修订意见。不要把阶段名误当作 skill 名，不要建议用户进入写作 / 论文装配流程——Coase 在 robustness 完成处结束。',
    skills: [
      'literature-review',
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
  const researchPrefs = await loadResearchPrefs();
  const systemPromptAppend = [
    COASE_SYSTEM_PROMPT_BASE,
    '',
    renderResearchPrefsForPrompt(researchPrefs),
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

  if (provider.baseURL) {
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
    // 用户在「研究偏好」面板关闭"联网搜索文献"时，从 SDK 工具清单里摘掉 WebSearch。
    // disallowedTools 会直接把工具从模型上下文中移除，不只是拦截调用。
    ...(researchPrefs.webSearchEnabled ? {} : { disallowedTools: ['WebSearch'] }),
    plugins: [
      { type: 'local', path: pluginPaths.builtin },
      { type: 'local', path: pluginPaths.user },
    ],
    mcpServers: {
      'coase-critic-panel': buildCriticPanelMcpServer(),
    },
    hooks: COASE_HOOKS,
    includeHookEvents: true,
    agentProgressSummaries: true,
    promptSuggestions: true,
    agents: COASE_AGENTS,
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
