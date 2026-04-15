// 起手式建议卡：用更轻的研究模板入口替代普通信息卡片。
const STARTERS = [
  {
    emoji: '📊',
    title: '分析数字人民币对中小零售商现金持有的影响',
    hint: '从研究设计开始',
  },
  {
    emoji: '↺',
    title: '继续最近一次 DID 研究',
    hint: '延续上次会话',
  },
  {
    emoji: '📝',
    title: '把已有回归结果写成论文 Results 段',
    hint: '跳过规划直接进入写作',
  },
];

export default function SuggestionStarters({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 md:grid-cols-3">
      {STARTERS.map((starter) => (
        <button
          key={starter.title}
          type="button"
          onClick={() => onPick(starter.title)}
          className="group rounded-[20px] border border-border/80 bg-surface px-4 py-4 text-left transition hover:border-border-strong hover:bg-app"
        >
          <div className="text-base opacity-80 transition group-hover:opacity-100">{starter.emoji}</div>
          <div className="mt-3 text-[13px] leading-6 text-fg">{starter.title}</div>
          <div className="mt-4 text-[11px] tracking-wide text-fg-subtle">{starter.hint}</div>
        </button>
      ))}
    </div>
  );
}
