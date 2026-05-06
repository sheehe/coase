import type {
  AgentDefinition,
  HookCallbackMatcher,
  PostToolUseFailureHookInput,
  PreToolUseHookInput,
  SubagentStopHookInput,
} from '@anthropic-ai/claude-agent-sdk';

import type { ResolvedLanguage } from '../../shared/app-prefs';
import type { ResearchPrefs } from '../../shared/research-prefs';

// 子 agent 定义和 hooks 都要跟语言走。skill 名是注册标识符，全语种都得保持
// 字面相同（'planner_workflow'、'executor_workflow'、'paper-reviewer'、
// 'full_research_workflow'），翻译只动 description / prompt 这种"喂给模型读"
// 的自然语言部分，不能动 skills 数组里的 ID。
//
// 注意：root agent 的 system prompt 通过 client.ts 的 systemPromptAppend 注入
// renderResearchPrefsForPrompt() 内容，但**子 agent 不继承** root systemPrompt
// 的 append 段，它们的 system prompt 来自 AgentDefinition.prompt 字段。所以
// research_purpose / web_search_enabled 这类用户偏好必须在这里再注入一次，
// 否则子 agent（research_planner / data_prep / empirical_analyst /
// quality_reviewer）完全看不到用户的偏好设置。

// "联网搜索文献：关闭"时拼到所有可能触发文献检索的子 agent prompt 末尾。
// 这只是软约束的提示层；硬约束由 PreToolUse hook 在工具调用前直接 deny。
const ZH_WEB_SEARCH_DISABLED_NOTE =
  '\n\n【重要约束】用户已在"研究偏好"中关闭"联网搜索文献"。你不得使用 WebSearch 检索任何内容，也不得使用 WebFetch 访问 cnki / wanfangdata / scholar.google / semanticscholar / jstor / ssrn / nber / repec / arxiv / sciencedirect / springer / wiley / aeaweb / researchgate / connectedpapers / doi.org 等学术文献 / 引文站点。参考文献仅能来自上下文提供的本地 PDF（references/）与已下载资料；若无本地资料，应在对应 stage 文件中明确记录"本地无可用文献，按用户偏好未联网补齐"，而不是绕道联网。**此限制只针对文献检索**：定位数据源、查询数据字典、查看政策 / 新闻 / API 文档等非文献用途，可以用 WebFetch 直接访问目标 URL（不要走 WebSearch）。';

const EN_WEB_SEARCH_DISABLED_NOTE =
  '\n\n[Hard constraint] The user has disabled "Literature web search" in Research Preferences. Do NOT call WebSearch for any purpose, and do NOT call WebFetch against academic / citation sites such as cnki, wanfangdata, scholar.google, semanticscholar, jstor, ssrn, nber, repec, arxiv, sciencedirect, springer, wiley, aeaweb, researchgate, connectedpapers, or doi.org. References must come only from the local PDFs (references/) and downloaded material provided in context; if none is available, explicitly record "no local literature available, not fetched online per user preference" in the relevant stage file rather than going online. **This restriction targets literature only** — for data-source location, data dictionaries, policy / news / API documentation, you may use WebFetch directly against the target URL (do not use WebSearch).';

function appendWebSearchNote(
  agents: Record<string, AgentDefinition>,
  agentIds: readonly string[],
  note: string,
): Record<string, AgentDefinition> {
  const result: Record<string, AgentDefinition> = {};
  for (const [id, def] of Object.entries(agents)) {
    if (agentIds.includes(id)) {
      result[id] = { ...def, prompt: def.prompt + note };
    } else {
      result[id] = def;
    }
  }
  return result;
}

// 会被文献检索硬约束影响的子 agent。empirical_analyst / data_prep 不参与
// 文献检索，正常情况下不会触发 WebSearch / 文献站 WebFetch，没必要污染 prompt。
const LITERATURE_AGENT_IDS = ['research_planner', 'quality_reviewer'] as const;

const ZH_AGENTS: Record<string, AgentDefinition> = {
  research_planner: {
    description:
      '负责研究问题澄清、文献定位、方法选择、识别策略设计与研究路线收敛。',
    prompt:
      '你是 Coase 的研究规划子代理。严格按 planner_workflow skill 的 8 个 Phase 推进（Idea-Data Alignment → 文献探索 → 假设生成 → Quality Gate → 变量映射 → 数据支撑 → Baseline 锁定 → Descriptive Snapshot），所有规则、阈值、落盘契约都在该 skill 文件里，不要去找已删除的方法 skill（ols-regression / iv-estimation / did-analysis 等）。需要全流水线视角时参考 full_research_workflow。',
    skills: ['planner_workflow', 'full_research_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
  data_prep: {
    description:
      '负责数据源定位、抓取、清洗、合并、变量构造与分析样本准备。',
    prompt:
      '你是 Coase 的数据准备子代理。数据扫描与对齐按 planner_workflow Phase 1（Idea-Data Alignment）执行；清洗、变量构造、样本准备、数据质量闸口按 executor_workflow Phase 1 的 6 条强制检查执行。所有规则在这两个 skill 里，不要去找已删除的 data-fetcher / data-cleaning 等独立 skill。',
    skills: ['planner_workflow', 'executor_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
  empirical_analyst: {
    description:
      '负责主回归、稳健性、机制、异质性、统计诊断、表格与图形输出。',
    prompt:
      '你是 Coase 的实证分析子代理。严格按 executor_workflow skill 的 Phase 1-5 执行（数据准备 → Run Baseline → Explanation & Robustness → Table/Figure Output → Assessment），所有方法学规则、表图契约（CSV 唯一真源 + theme_coase/save_fig 双件套 + modelsummary 长→宽后处理）、落盘路径都在该 skill 文件里。不要去找已删除的方法 skill（ols-regression / iv-estimation / stats / table / figure 等）。',
    skills: ['executor_workflow'],
    model: 'inherit',
    maxTurns: 48,
  },
  quality_reviewer: {
    description:
      '负责从设计、执行和证据一致性角度做对抗式质量复核。',
    prompt:
      '你是 Coase 的质量复核子代理。严格按 paper-reviewer skill 做对抗式复核——评审对象包括研究 idea / baseline 设计（Mode A）与已执行的主回归及诊断（Mode B），对照 executor_workflow 的表图契约（CSV 唯一真源 / 长→宽后处理 / 零线 layer 顺序 / plot.margin 等）评估实证质量。不要建议用户进入写作 / 论文装配流程——Coase 在 robustness 完成处结束。',
    skills: ['paper-reviewer', 'executor_workflow', 'planner_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
};

const EN_AGENTS: Record<string, AgentDefinition> = {
  research_planner: {
    description:
      'Handles research question clarification, literature search, method selection, identification strategy design, and research plan convergence.',
    prompt:
      "You are Coase's research planning sub-agent. Follow the planner_workflow skill strictly across its 8 Phases (Idea-Data Alignment → literature search → hypothesis generation → Quality Gate → variable mapping → data support → Baseline lock → Descriptive Snapshot). All rules, thresholds, and file-write contracts live in that skill file — do not look for the now-removed method skills (ols-regression / iv-estimation / did-analysis, etc.). Consult full_research_workflow when you need an end-to-end pipeline view.",
    skills: ['planner_workflow', 'full_research_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
  data_prep: {
    description:
      'Handles data source location, fetching, cleaning, merging, variable construction, and analysis sample preparation.',
    prompt:
      "You are Coase's data preparation sub-agent. Run data scanning / alignment per planner_workflow Phase 1 (Idea-Data Alignment); cleaning, variable construction, sample preparation, and the data-quality gate per executor_workflow Phase 1's 6 mandatory checks. All rules live in those two skills — do not look for the now-removed standalone data-fetcher / data-cleaning skills.",
    skills: ['planner_workflow', 'executor_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
  empirical_analyst: {
    description:
      'Handles main regressions, robustness, mechanisms, heterogeneity, statistical diagnostics, and table/figure output.',
    prompt:
      "You are Coase's empirical analysis sub-agent. Follow the executor_workflow skill strictly across Phases 1-5 (data preparation → Run Baseline → Explanation & Robustness → Table/Figure Output → Assessment). All methodological rules, the table/figure contract (CSV as the single source of truth, theme_coase / save_fig, modelsummary long→wide reshape), and file-write paths live in that skill file. Do not look for the now-removed method skills (ols-regression / iv-estimation / stats / table / figure, etc.).",
    skills: ['executor_workflow'],
    model: 'inherit',
    maxTurns: 48,
  },
  quality_reviewer: {
    description:
      'Performs adversarial quality review across design, execution, and evidence consistency.',
    prompt:
      "You are Coase's quality review sub-agent. Follow the paper-reviewer skill strictly for adversarial review — evaluation targets include the research idea / baseline design (Mode A) and executed main regressions plus diagnostics (Mode B); cross-check against executor_workflow's table/figure contract (CSV-only source of truth, long→wide reshape, zero-line layer order, plot.margin, etc.). Do not advise the user to enter writing or paper-assembly workflows — Coase ends at robustness completion.",
    skills: ['paper-reviewer', 'executor_workflow', 'planner_workflow'],
    model: 'inherit',
    maxTurns: 32,
  },
};

export function getCoaseAgents(
  language: ResolvedLanguage,
  prefs?: ResearchPrefs,
): Record<string, AgentDefinition> {
  const base = language === 'en' ? EN_AGENTS : ZH_AGENTS;
  if (prefs && prefs.webSearchEnabled === false) {
    const note = language === 'en' ? EN_WEB_SEARCH_DISABLED_NOTE : ZH_WEB_SEARCH_DISABLED_NOTE;
    return appendWebSearchNote(base, LITERATURE_AGENT_IDS, note);
  }
  return base;
}

// "联网搜索文献：关闭"时，PreToolUse hook 用来识别"是不是文献场景"的硬规则。
// WebSearch 一律 deny（绝大多数 WebSearch 都用于文献检索，数据源 / 政策 / API
// 文档场景用户通常已经知道目标 URL，应该直接 WebFetch）。WebFetch 仅在 URL
// 命中下面这些学术 / 引文 host 时才 deny，其他 host 放行（数据源、政策、新闻、
// API 文档不受影响——这跟 prefs 文档里的承诺一致）。
const LITERATURE_HOST_PATTERNS: readonly string[] = [
  'scholar.google',
  'semanticscholar.org',
  'connectedpapers.com',
  'sci-hub',
  'jstor.org',
  'ssrn.com',
  'nber.org',
  'repec.org',
  'ideas.repec',
  'arxiv.org',
  'sciencedirect.com',
  'springer.com',
  'springeropen.com',
  'link.springer',
  'wiley.com',
  'onlinelibrary.wiley',
  'tandfonline.com',
  'oup.com',
  'academic.oup',
  'elsevier.com',
  'cambridge.org',
  'aeaweb.org',
  'researchgate.net',
  'doi.org',
  'cnki.net',
  'wanfangdata.com.cn',
  'cqvip.com',
];

function urlHitsLiteratureHost(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  const url = rawUrl.toLowerCase();
  return LITERATURE_HOST_PATTERNS.some((pattern) => url.includes(pattern));
}

interface WebGuardStrings {
  webSearchDenied: string;
  webFetchDenied: (host: string) => string;
}

const ZH_WEB_GUARD: WebGuardStrings = {
  webSearchDenied:
    '用户已在"研究偏好"中关闭"联网搜索文献"，WebSearch 已被全局禁用。如果你想定位数据源、查询政策 / 新闻 / API 文档，请直接用 WebFetch 访问已知的目标 URL；如果你确实是在做文献综述但本地 references/ 无可用 PDF，请在 stage 文件中如实记录"无本地文献"并继续，不要尝试绕过该限制。',
  webFetchDenied: (host) =>
    `用户已在"研究偏好"中关闭"联网搜索文献"，WebFetch 不允许访问学术 / 引文站点（命中：${host}）。文献仅能来自本地 references/ 与已下载资料；非文献场景（数据源 / 政策 / API 文档）请改访问对应站点的 URL。`,
};

const EN_WEB_GUARD: WebGuardStrings = {
  webSearchDenied:
    'The user has disabled "Literature web search" in Research Preferences. WebSearch is globally blocked. To locate data sources, policy / news pages, or API documentation, call WebFetch directly against the known target URL; if you genuinely need a literature review but no local PDF is available under references/, record "no local literature" in the stage file and continue rather than trying to bypass this restriction.',
  webFetchDenied: (host) =>
    `The user has disabled "Literature web search" in Research Preferences. WebFetch is blocked for academic / citation hosts (matched: ${host}). References must come from local references/ and downloaded material only; for non-literature uses (data sources, policy, API docs), fetch the corresponding non-academic URL instead.`,
};

function buildWebSearchGuardHook(
  prefs: ResearchPrefs | undefined,
  language: ResolvedLanguage,
): HookCallbackMatcher | null {
  if (!prefs || prefs.webSearchEnabled !== false) return null;
  const strings = language === 'en' ? EN_WEB_GUARD : ZH_WEB_GUARD;
  return {
    hooks: [
      async (input) => {
        const event = input as PreToolUseHookInput;
        const toolName = event.tool_name;
        if (toolName !== 'WebSearch' && toolName !== 'WebFetch') {
          return { continue: true };
        }
        if (toolName === 'WebSearch') {
          return {
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: strings.webSearchDenied,
            },
          };
        }
        // WebFetch：只拦学术 / 引文 host，其他 host 放行
        const url = (event.tool_input as Record<string, unknown> | null | undefined)?.url;
        if (urlHitsLiteratureHost(url)) {
          const matched = LITERATURE_HOST_PATTERNS.find((p) =>
            String(url).toLowerCase().includes(p),
          );
          return {
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: strings.webFetchDenied(matched ?? 'literature host'),
            },
          };
        }
        return { continue: true };
      },
    ],
  };
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
  prefs?: ResearchPrefs,
): Partial<Record<string, HookCallbackMatcher[]>> {
  const strings = language === 'en' ? EN_HOOK_STRINGS : ZH_HOOK_STRINGS;
  const webGuard = buildWebSearchGuardHook(prefs, language);
  return {
    ...(webGuard ? { PreToolUse: [webGuard] } : {}),
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
