import type { SkillInfo } from '../../../shared/skills';

export type SlashCommandKind = 'workflow' | 'skill';

export interface SlashCommandDef {
  id: string;
  trigger: string;
  title: string;
  description: string;
  kind: SlashCommandKind;
  source: 'alias' | 'skill';
  sourceLabel: string;
  aliases: string[];
  targetSkills: string[];
  guidance: string;
}

export interface SelectedSlashCommand {
  id: string;
  trigger: string;
  title: string;
  description: string;
  kind: SlashCommandKind;
  sourceLabel: string;
  targetSkills: string[];
  guidance: string;
}

const WORKFLOW_ALIASES: SlashCommandDef[] = [
  {
    id: 'full-research',
    trigger: '/full-research',
    title: 'Full Research Pipeline',
    description: '从零到结果的完整流程',
    kind: 'workflow',
    source: 'alias',
    sourceLabel: '工作流',
    aliases: ['完整研究', '从零开始', '找方向', 'full pipeline', '全流程'],
    targetSkills: ['full_research_workflow'],
    guidance: [
      '把当前任务当作完整研究管线。优先调用 full_research_workflow，它会依次编排：idea 生成 → 多模型对抗评分迭代 → 用户选定 → planner_workflow 锁 baseline design（含 fallback 识别策略队列）→ executor_workflow 执行 → significance-verdict 诊断判决。',
      '对抗评分阶段：用户已在设置页选好"评审模型组"。调用 idea-critic skill，按 provider 并行调度多模型评分并聚合。用户感知上只需要选模型，不用关心底层是 SDK 直连还是 MCP。',
      '执行阶段失败处理：只在"识别诊断失败"（平行趋势被拒 / 弱工具 / 带宽崩 / 测量失效等）时才按 planner 预注册的 fallback 队列切换识别策略。**p 值不显著且识别通过不是失败**，那是合法 null result，按 null result 路径进入 robustness。除非 exploratory_mode 开启，否则绝不允许"系数不显著就换方法"。',
      'fallback 队列、诊断套件、exploratory_mode 的具体实现参见 full_research_workflow SKILL.md。所有方法切换记入 verdict/spec_log.md。本工作流在 robustness 完成处结束，不涉及写作/论文装配——产物交给用户决定下一步。',
    ].join('\n\n'),
  },
  {
    id: 'idea-to-results',
    trigger: '/idea-to-results',
    title: 'Idea to Results',
    description: '已有 idea，设计到结果',
    kind: 'workflow',
    source: 'alias',
    sourceLabel: '工作流',
    aliases: ['从idea到结果', '有想法跑实验', 'idea-discovery', '选题已定'],
    targetSkills: ['planner_workflow', 'executor_workflow'],
    guidance: [
      '把当前任务当作"idea→结果"链路。先调用 planner_workflow 完成 stage_1~stage_8 规划，**Phase 2 Step 3 Baseline Design Lock 必须同时注册 primary + 至少一个 fallback 识别策略**，写入 planner/stage_7_baseline_design.md 的 fallback_queue 字段。',
      '规划完成后自动进入 executor_workflow，按 primary 策略跑 baseline。触发 significance-verdict 判决：识别通过 + 显著 → robustness；识别通过 + null + 功效足 → 标记合法 null result 继续 robustness；识别通过 + null + 功效不足 → 建议扩样本/改测量；识别失败 → 按 fallback 队列切下一策略重跑。',
      '所有切换必须记入 verdict/spec_log.md，禁止"系数不显著就换方法"。exploratory_mode 可放宽，但产物强制标注 EXPLORATORY。',
    ].join('\n\n'),
  },
  {
    id: 'run-experiment',
    trigger: '/run-experiment',
    title: 'Run Experiment',
    description: '已锁 baseline，执行与诊断',
    kind: 'workflow',
    source: 'alias',
    sourceLabel: '工作流',
    aliases: ['跑实验', '跑主回归', '执行', 'experiment-bridge', '实验桥接'],
    targetSkills: ['executor_workflow'],
    guidance: [
      '把当前任务当作纯执行工作流。前置条件：planner/stage_7_baseline_design.md 已存在且锁定 primary + fallback_queue。若缺失，停下来让用户先走 /idea-to-results 或 /full-research。',
      '按 baseline design 中锁定的识别策略调用对应方法 skill（ols-regression / did-analysis / iv-estimation / rdd-analysis / panel-data / synthetic-control / time-series / ml-causal）。主回归完成后强制跑诊断套件（识别假设 + 功效分析 + 测量敏感性），再调用 significance-verdict 判决。**禁止擅自切换识别策略**，切换必须由诊断驱动。',
      '诊断失败进入 fallback 队列时，每一次切换在 verdict/spec_log.md 里写明：切换的诊断理由、被否决的策略、新策略。所有产物走 table / figure skill 规范化。',
    ].join('\n\n'),
  },
  {
    id: 'review',
    trigger: '/review',
    title: '方案评审',
    description: '对 idea / 研究方案做对抗评审',
    kind: 'workflow',
    source: 'alias',
    sourceLabel: '工作流',
    aliases: ['审阅', '方案评审', 'idea评审', '对抗审阅', 'paper-review', 'review'],
    targetSkills: ['paper-reviewer'],
    guidance: [
      '把当前任务当作评审工作流，直接调用 paper-reviewer skill。输入是用户提交的 idea 描述、研究方案（planner/stage_7_baseline_design.md 等）、或已有 draft。用户应已在"评审模型组"中选好 ≥1 个 provider。',
      '对每个选中的 provider 模型通过 mcp__coase-critic-panel__invoke 并行生成 referee report。评审模式按输入物判断：计划/方案评审走 Mode A（识别策略可信度、假设表述、数据-设计匹配）；已有执行结果走 Mode B（结果自洽性、诊断充分性）；已有 draft 写作走 Mode C（论文表述与证据一致性）。',
      '聚合所有 referee report，按"共识项 / 重大分歧 / 单一模型独有"三档排序，转成可执行 todo 清单。只输出意见，不代用户改方案或改稿。最终判定使用 APPROVE / REVISE 两态。',
    ].join('\n\n'),
  },
];

const SKILL_OVERRIDES = new Map<string, Partial<SlashCommandDef>>([
  [
    'planner_workflow',
    {
      title: 'Planner Workflow',
      description: '规划型 workflow：从研究目标到 baseline 设计与阶段文档沉淀。',
      kind: 'workflow',
      aliases: ['planner', '规划工作流'],
      targetSkills: ['planner_workflow'],
      guidance: '优先执行 planner_workflow，输出完整规划阶段文档并为后续执行提供输入。',
    },
  ],
  [
    'executor_workflow',
    {
      title: 'Executor Workflow',
      description: '执行型 workflow：从方案落地到结果、表图和执行评估。',
      kind: 'workflow',
      aliases: ['executor', '执行工作流'],
      targetSkills: ['executor_workflow'],
      guidance:
        '优先执行 executor_workflow，围绕既有设计完成数据准备、基线分析、稳健性检查和产物输出。',
    },
  ],
  [
    'latex_compile_repair',
    {
      title: 'LaTeX Compile Repair',
      description: '辅助 skill：定位和修复 LaTeX 编译错误。',
      kind: 'skill',
      aliases: ['latex 修复', '编译修复'],
      targetSkills: ['latex_compile_repair'],
      guidance: '仅在 LaTeX 编译失败或引用缺失时调用 latex_compile_repair。',
    },
  ],
]);

const WORKFLOW_ALIAS_IDS = new Set(WORKFLOW_ALIASES.map((command) => command.id));
const HIDDEN_SKILL_IDS = new Set([
  'planner_workflow',
  'executor_workflow',
  'full_research_workflow',
  'ols-regression',
  'did-analysis',
  'iv-estimation',
  'rdd-analysis',
  'panel-data',
  'synthetic-control',
  'time-series',
  'ml-causal',
  'data-cleaning',
  'data-fetcher',
  'stats',
  'figure',
  'table',
  'literature-review',
  'claude-api',
  'idea-generator',
  'idea-critic',
  'significance-verdict',
  'paper-reviewer',
  'do',
  'make-plan',
  'smart-explore',
  'mem-search',
  'timeline-report',
  'latex_compile_repair',
]);

export function buildSlashCommands(skills: SkillInfo[]): SlashCommandDef[] {
  const merged = new Map<string, SlashCommandDef>();

  for (const skill of skills) {
    const id = normalizeSkillId(skill.name);
    if (HIDDEN_SKILL_IDS.has(id)) continue;
    const override = SKILL_OVERRIDES.get(id);
    const trigger = `/${id}`;

    merged.set(id, {
      id,
      trigger,
      title: override?.title ?? toTitleCase(skill.name),
      description: override?.description ?? skill.description,
      kind: override?.kind ?? inferKind(id),
      source: override?.source ?? 'skill',
      sourceLabel:
        skill.source === 'coase-user'
          ? '个人'
          : (override?.kind ?? inferKind(id)) === 'workflow'
            ? '工作流'
            : '内置',
      aliases: override?.aliases ?? [],
      targetSkills: override?.targetSkills ?? [id],
      guidance:
        override?.guidance ??
        `用户显式选择了技能 ${trigger}。优先调用并遵循这个技能，除非你能明确说明它与当前任务不匹配。`,
    });
  }

  for (const command of WORKFLOW_ALIASES) {
    merged.set(command.id, command);
  }

  return [...merged.values()].sort((a, b) => {
    const aPinned = WORKFLOW_ALIAS_IDS.has(a.id) ? 0 : 1;
    const bPinned = WORKFLOW_ALIAS_IDS.has(b.id) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    if (a.kind !== b.kind) return a.kind === 'workflow' ? -1 : 1;
    return a.title.localeCompare(b.title, 'en');
  });
}

export function filterSlashCommands(
  commands: SlashCommandDef[],
  query: string,
): SlashCommandDef[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return commands.slice(0, 12);

  return commands
    .filter((command) => {
      const haystacks = [
        command.trigger,
        command.title,
        command.description,
        ...command.aliases,
        ...command.targetSkills,
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 12);
}

export function injectSlashCommandContext(
  text: string,
  commands: SelectedSlashCommand[],
): string {
  if (commands.length === 0) return text;

  const lines = [
    '以下命令/技能是用户通过命令选择器显式选中的，不是普通文本。请优先按这些工作流/技能执行：',
    ...commands.map(
      (command) =>
        `- ${command.trigger} (${command.kind}) -> ${command.targetSkills.join(', ') || 'no explicit skill'}`,
    ),
    '',
    '逐项执行要求：',
    ...commands.map((command) => `- ${command.trigger}: ${command.guidance}`),
  ];

  if (text.trim()) {
    lines.push('', '用户补充请求：', text.trim());
  } else {
    lines.push('', '用户没有补充自由文本，请直接按上述命令对应的工作流开始执行。');
  }

  return lines.join('\n');
}

export interface SlashTriggerMatch {
  query: string;
  start: number;
  end: number;
}

export function findSlashTriggerMatch(
  input: string,
  cursor: number,
): SlashTriggerMatch | null {
  const safeCursor = Math.max(0, Math.min(cursor, input.length));
  const beforeCursor = input.slice(0, safeCursor);
  const slashIndex = beforeCursor.lastIndexOf('/');
  if (slashIndex < 0) return null;
  if (slashIndex > 0 && !/\s/.test(beforeCursor[slashIndex - 1] ?? '')) return null;

  const query = beforeCursor.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    query,
    start: slashIndex,
    end: safeCursor,
  };
}

function inferKind(id: string): SlashCommandKind {
  return id.includes('pipeline') || id.includes('workflow') ? 'workflow' : 'skill';
}

function normalizeSkillId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-');
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
