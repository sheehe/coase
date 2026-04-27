import type {
  AgentDefinition,
  HookCallbackMatcher,
  PostToolUseFailureHookInput,
  SubagentStopHookInput,
} from '@anthropic-ai/claude-agent-sdk';

import type { ResolvedLanguage } from '../../shared/app-prefs';

// 子 agent 定义和 hooks 都要跟语言走。skill 名是注册标识符，全语种都得保持
// 字面相同（'literature-review'、'data-fetcher'…），翻译只动 description / prompt
// 这种"喂给模型读"的自然语言部分，不能动 skills 数组里的 ID。

const ZH_AGENTS: Record<string, AgentDefinition> = {
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

const EN_AGENTS: Record<string, AgentDefinition> = {
  research_planner: {
    description:
      'Handles research question clarification, literature search, method selection, identification strategy design, and research plan convergence.',
    prompt:
      "You are Coase's research planning sub-agent. Prefer the literature-review skill and method skills to handle question clarification, literature search, method selection, identification assumption review, and research plan convergence. Do not mistake stage names for skill names.",
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
      'Handles data source location, fetching, cleaning, merging, variable construction, and analysis sample preparation.',
    prompt:
      "You are Coase's data preparation sub-agent. Prefer the data-fetcher and data-cleaning skills to handle data source selection, fetching, merging, cleaning, sample construction, and quality checks. Do not mistake stage names for skill names.",
    skills: ['data-fetcher', 'data-cleaning'],
    model: 'inherit',
    maxTurns: 32,
  },
  empirical_analyst: {
    description:
      'Handles main regressions, robustness, mechanisms, heterogeneity, statistical diagnostics, and table/figure output.',
    prompt:
      "You are Coase's empirical analysis sub-agent. Select the most appropriate econometrics skill for the research question, and produce baseline estimates, extended tests, descriptive statistics, and table/figure output. Do not mistake stage names for skill names.",
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
      'Performs adversarial quality review across design, execution, and evidence consistency.',
    prompt:
      "You are Coase's quality review sub-agent. Use the method specifications, table/figure specifications, and literature search capabilities from the econometrics plugin skills to adversarially review the current research outputs (the idea/planner/executor/verdict directories) and produce specific revision suggestions. Do not mistake stage names for skill names. Do not advise the user to enter writing or paper assembly workflows — Coase ends at robustness completion.",
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

export function getCoaseAgents(language: ResolvedLanguage): Record<string, AgentDefinition> {
  return language === 'en' ? EN_AGENTS : ZH_AGENTS;
}

interface HookStrings {
  toolFailure: (toolName: string) => string;
  subagentStart: (agentType: string) => string;
  subagentStopWithSummary: (agentType: string, summary: string) => string;
  subagentStopWithoutSummary: (agentType: string) => string;
}

const ZH_HOOK_STRINGS: HookStrings = {
  toolFailure: (toolName) =>
    `工具 ${toolName} 刚刚失败。先理解失败原因，再决定是否重试；不要机械重复同一失败调用。必要时切换工具、缩小范围或调整方案。`,
  subagentStart: (agentType) =>
    `你正在启动子代理 ${agentType}。请让它聚焦局部问题，返回可整合的结论、关键证据与文件路径，不要让它偏离主研究目标。`,
  subagentStopWithSummary: (agentType, summary) =>
    `子代理 ${agentType} 已结束。其最后摘要为：${summary}`,
  subagentStopWithoutSummary: (agentType) =>
    `子代理 ${agentType} 已结束，请将其产出整合回主研究主线。`,
};

const EN_HOOK_STRINGS: HookStrings = {
  toolFailure: (toolName) =>
    `Tool ${toolName} just failed. First understand the failure cause, then decide whether to retry; do not mechanically repeat the same failed call. Switch tools, narrow scope, or adjust your approach as needed.`,
  subagentStart: (agentType) =>
    `You are starting sub-agent ${agentType}. Have it focus on a local problem and return integrable conclusions, key evidence, and file paths. Do not let it drift from the main research goal.`,
  subagentStopWithSummary: (agentType, summary) =>
    `Sub-agent ${agentType} has finished. Its final summary: ${summary}`,
  subagentStopWithoutSummary: (agentType) =>
    `Sub-agent ${agentType} has finished. Please integrate its output back into the main research line.`,
};

export function getCoaseHooks(
  language: ResolvedLanguage,
): Partial<Record<string, HookCallbackMatcher[]>> {
  const strings = language === 'en' ? EN_HOOK_STRINGS : ZH_HOOK_STRINGS;
  return {
    PostToolUseFailure: [
      {
        hooks: [
          async (input) => {
            const failure = input as PostToolUseFailureHookInput;
            return {
              continue: true,
              hookSpecificOutput: {
                hookEventName: 'PostToolUseFailure',
                additionalContext: strings.toolFailure(failure.tool_name),
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
              additionalContext: strings.subagentStart(input.agent_type ?? 'unknown'),
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
            const trimmed = subagent.last_assistant_message?.trim();
            const agentType = subagent.agent_type ?? 'unknown';
            return {
              continue: true,
              systemMessage: trimmed
                ? strings.subagentStopWithSummary(agentType, trimmed)
                : strings.subagentStopWithoutSummary(agentType),
            };
          },
        ],
      },
    ],
  };
}
