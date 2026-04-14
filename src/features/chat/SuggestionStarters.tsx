// 起手式建议卡：给空会话提供领域导向的输入模板。
const STARTERS = [
  {
    emoji: '📊',
    title: '分析数字人民币对中小零售商现金持有的影响',
    hint: '从 Planner 开始',
  },
  {
    emoji: '🔁',
    title: '继续最近一次 DID 研究',
    hint: '延续上次会话',
  },
  {
    emoji: '📝',
    title: '把已有回归结果写成论文 Results 段',
    hint: '跳过 Planner 直接 Writer',
  },
];

export default function SuggestionStarters({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex w-full max-w-[680px] flex-wrap gap-3">
      {STARTERS.map((starter) => (
        <button
          key={starter.title}
          type="button"
          onClick={() => onPick(starter.title)}
          className="min-w-[200px] flex-1 rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-border-strong"
        >
          <div className="text-lg">{starter.emoji}</div>
          <div className="mt-3 text-[13px] leading-snug text-fg">{starter.title}</div>
          <div className="mt-4 text-[11px] text-fg-subtle">{starter.hint}</div>
        </button>
      ))}
    </div>
  );
}
