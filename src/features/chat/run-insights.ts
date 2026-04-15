// 运行洞察：从 transcript 推导软里程碑与产物视图，供当前 run 与历史回放复用。
import type { TranscriptEntry } from './TranscriptMessage';

export type InsightStage = 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer';

export interface MilestoneRecord {
  id: string;
  ts: number;
  kind: 'run_started' | 'stage_reached' | 'interrupted' | 'completed' | 'failed';
  label: string;
  stage?: InsightStage;
}

export interface ArtifactRecord {
  id: string;
  ts: number;
  kind:
    | 'plan'
    | 'r_script'
    | 'results_text'
    | 'draft_section'
    | 'review_note'
    | 'table'
    | 'figure'
    | 'generated_file'
    | 'final_paper';
  title: string;
  contentPreview: string;
  content: string;
  inferredStage?: InsightStage;
  sourceTool?: string;
  path?: string;
  mediaType?: string;
  filePath?: string;
}

export interface RunInsights {
  milestones: MilestoneRecord[];
  artifacts: ArtifactRecord[];
  currentMilestone: string;
}

const STAGE_LABELS: Record<InsightStage, string> = {
  planner: '研究规划已展开',
  datafetcher: '数据准备已展开',
  analyst: '分析阶段已展开',
  writer: '写作阶段已展开',
  reviewer: '审校阶段已展开',
};

const STAGE_RULES: { stage: InsightStage; keywords: string[] }[] = [
  { stage: 'reviewer', keywords: ['reviewer', '审校', '审稿', 'review'] },
  { stage: 'writer', keywords: ['writer', '写作', 'results', 'discussion'] },
  { stage: 'analyst', keywords: ['analyst', '分析', '回归', '估计'] },
  { stage: 'datafetcher', keywords: ['datafetcher', '取数', '样本', '清洗'] },
  { stage: 'planner', keywords: ['planner', '规划', '识别策略', '研究设计'] },
];

export function deriveRunInsights(transcript: TranscriptEntry[]): RunInsights {
  if (transcript.length === 0) {
    return {
      milestones: [],
      artifacts: [],
      currentMilestone: '尚未开始研究',
    };
  }

  const milestones: MilestoneRecord[] = [
    {
      id: `run-start-${transcript[0]?.ts ?? 0}`,
      ts: transcript[0]?.ts ?? Date.now(),
      kind: 'run_started',
      label: '研究已启动',
    },
  ];
  const artifacts: ArtifactRecord[] = [];
  const seenStages = new Set<InsightStage>();
  const seenArtifactIds = new Set<string>();

  for (let i = 0; i < transcript.length; i += 1) {
    const entry = transcript[i];
    const stage = inferStageFromEntry(entry);

    if (stage && !seenStages.has(stage)) {
      seenStages.add(stage);
      milestones.push({
        id: `stage-${stage}-${entry.ts}`,
        ts: entry.ts,
        kind: 'stage_reached',
        label: STAGE_LABELS[stage],
        stage,
      });
    }

    if (entry.kind === 'status') {
      if (entry.text.includes('等待你的指导') || entry.text.includes('暂停')) {
        milestones.push({
          id: `interrupt-${entry.ts}`,
          ts: entry.ts,
          kind: 'interrupted',
          label: '自动运行已暂停，等待用户指导',
          stage,
        });
      } else if (entry.text.includes('终止') || entry.text.includes('错误中止')) {
        milestones.push({
          id: `failed-${entry.ts}`,
          ts: entry.ts,
          kind: 'failed',
          label: '研究运行已终止',
          stage,
        });
      } else if (entry.text.includes('完成')) {
        milestones.push({
          id: `completed-${entry.ts}`,
          ts: entry.ts,
          kind: 'completed',
          label: '自动运行已完成一轮研究输出',
          stage,
        });
      }
    }

    if (entry.kind === 'assistant' && entry.text.trim().length >= 80) {
      const artifactKind = mapAssistantArtifactKind(stage, entry.text);
      if (!artifactKind) continue;
      pushArtifact(artifacts, seenArtifactIds, {
        id: `artifact-assistant-${artifactKind}-${entry.ts}`,
        ts: entry.ts,
        kind: artifactKind,
        title: artifactTitleForKind(artifactKind),
        contentPreview: shorten(firstParagraph(entry.text), 240),
        content: entry.text,
        inferredStage: stage,
      });
    }
  }

  const currentMilestone = milestones[milestones.length - 1]?.label ?? '尚未开始研究';
  return { milestones, artifacts, currentMilestone };
}

function inferStageFromEntry(entry: TranscriptEntry): InsightStage | undefined {
  const haystack =
    entry.kind === 'assistant'
      ? entry.text.toLowerCase()
      : entry.kind === 'tool_use'
        ? entry.name.toLowerCase()
        : entry.kind === 'status'
          ? entry.text.toLowerCase()
          : '';

  if (!haystack) return undefined;

  for (const rule of STAGE_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return rule.stage;
    }
  }

  return undefined;
}

function mapAssistantArtifactKind(
  stage: InsightStage | undefined,
  text: string,
): ArtifactRecord['kind'] | undefined {
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes('abstract') ||
    lowerText.includes('论文') ||
    lowerText.includes('manuscript')
  ) {
    return 'final_paper';
  }

  switch (stage) {
    case 'planner':
      return 'plan';
    case 'analyst':
    case 'datafetcher':
      return 'results_text';
    case 'writer':
      return 'draft_section';
    case 'reviewer':
      return 'review_note';
    default:
      return undefined;
  }
}

function artifactTitleForKind(kind: ArtifactRecord['kind']) {
  switch (kind) {
    case 'plan':
      return '研究规划摘要';
    case 'r_script':
      return 'R 脚本';
    case 'results_text':
      return '分析结果摘要';
    case 'draft_section':
      return '论文草稿片段';
    case 'review_note':
      return '审校意见';
    case 'table':
      return '表格产物';
    case 'figure':
      return '图形产物';
    case 'generated_file':
      return '生成文件';
    case 'final_paper':
      return '论文稿件输出';
  }
}

function pushArtifact(
  artifacts: ArtifactRecord[],
  seenArtifactIds: Set<string>,
  artifact: ArtifactRecord,
): void {
  if (seenArtifactIds.has(artifact.id)) return;
  seenArtifactIds.add(artifact.id);
  artifacts.push(artifact);
}

function firstParagraph(text: string): string {
  const [line] = text.trim().split(/\r?\n\r?\n|\r?\n/);
  return line?.trim() || text.trim();
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
