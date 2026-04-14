// 顶部流水线阶段条：突出当前研究所处阶段与浓缩指标。
import { ChevronRight } from '../components/Icons';

type StageKey = 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer';

interface StageRailProps {
  currentStage?: StageKey;
  turns?: string;
  cost?: string;
  model?: string;
}

const STAGES: { key: StageKey; label: string; english: string }[] = [
  { key: 'planner', label: '规划', english: 'Planner' },
  { key: 'datafetcher', label: '取数', english: 'DataFetcher' },
  { key: 'analyst', label: '分析', english: 'Analyst' },
  { key: 'writer', label: '写作', english: 'Writer' },
  { key: 'reviewer', label: '审校', english: 'Reviewer' },
];

export default function StageRail({
  currentStage = 'planner',
  turns = '--',
  cost = '--',
  model = '未建立会话',
}: StageRailProps) {
  const currentIndex = STAGES.findIndex((stage) => stage.key === currentStage);

  return (
    <div className="flex h-[72px] items-center border-b border-border px-6">
      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-1">
        <div className="flex min-w-0 items-center">
          {STAGES.map((stage, index) => {
            const isCurrent = index === currentIndex;
            const isDone = index < currentIndex;
            const dotClass = isCurrent ? 'bg-accent' : isDone ? 'bg-success' : 'bg-border-strong';

            return (
              <div key={stage.key} className="flex items-center">
                <div
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium',
                    isCurrent
                      ? 'bg-accent text-accent-fg'
                      : isDone
                        ? 'border border-border text-fg'
                        : 'border border-border/50 text-fg-subtle',
                  ].join(' ')}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                  <span>{stage.label}</span>
                  <span className="text-[11px] opacity-70">{stage.english}</span>
                </div>
                {index < STAGES.length - 1 && (
                  <ChevronRight size={12} className="mx-1 text-fg-subtle" />
                )}
              </div>
            );
          })}
        </div>

        <div className="ml-auto whitespace-nowrap text-[11px] font-mono text-fg-muted">
          {turns} turns · {cost} · {model}
        </div>
      </div>
    </div>
  );
}
