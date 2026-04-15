import type { SkillInfo } from '../../../shared/skills';

export type SlashCommandKind = 'workflow' | 'skill';

export interface SlashCommandDef {
  id: string;
  trigger: string;
  title: string;
  description: string;
  kind: SlashCommandKind;
  source: 'alias' | 'skill';
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
  targetSkills: string[];
  guidance: string;
}

const WORKFLOW_ALIASES: SlashCommandDef[] = [
  {
    id: 'idea-discovery',
    trigger: '/idea-discovery',
    title: 'Idea Discovery',
    description:
      'Workflow 1: 从研究方向或初步想法出发，收敛成可执行研究方案，并沉淀规划文档。',
    kind: 'workflow',
    source: 'alias',
    aliases: ['找idea', '选题探索', '方向探索', '研究规划'],
    targetSkills: ['planner_workflow'],
    guidance:
      '把当前任务当作规划型 workflow。优先调用 planner_workflow，先梳理研究目标、数据与问题对齐、文献与假设，再形成可执行的 baseline design 和后续计划。',
  },
  {
    id: 'experiment-bridge',
    trigger: '/experiment-bridge',
    title: 'Experiment Bridge',
    description:
      'Workflow 2: 已经有方案或 baseline design 后，进入实验执行与结果沉淀流程。',
    kind: 'workflow',
    source: 'alias',
    aliases: ['实验桥接', '实现实验', '跑实验', '实验执行'],
    targetSkills: ['executor_workflow'],
    guidance:
      '把当前任务当作执行型 workflow。优先调用 executor_workflow，读取已有方案与设计文档，完成数据准备、基线回归、稳健性检验、表图产出和执行总结。',
  },
  {
    id: 'paper-writing',
    trigger: '/paper-writing',
    title: 'Paper Writing',
    description:
      'Workflow 3: 基于已有实验结果与材料，组织 claims、证据、章节和 LaTeX 论文产物。',
    kind: 'workflow',
    source: 'alias',
    aliases: ['论文写作', '写论文', 'paper'],
    targetSkills: ['writer_workflow'],
    guidance:
      '把当前任务当作写作型 workflow。优先调用 writer_workflow，基于现有计划、结果、表图和审阅材料，组织 claims-evidence、章节文本、参考文献和完整论文。',
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
    'writer_workflow',
    {
      title: 'Writer Workflow',
      description: '写作型 workflow：从结果材料到章节、整文与编译产物。',
      kind: 'workflow',
      aliases: ['writer', '写作工作流'],
      targetSkills: ['writer_workflow'],
      guidance:
        '优先执行 writer_workflow，整理 claims-evidence、章节内容、参考文献和完整论文装配。',
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
const HIDDEN_SKILL_IDS = new Set(['planner_workflow', 'executor_workflow', 'writer_workflow']);

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
