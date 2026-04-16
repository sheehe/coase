// 空会话 Hero：品牌标题 + 简短使用说明。
import StageRail from '../../layouts/StageRail';

export default function EmptyHero() {
  return (
    <div className="flex flex-1 flex-col items-center justify-end px-6 pb-8 pt-10">
      <div className="flex w-full max-w-[780px] flex-col items-center">
        <div className="mb-10 flex w-full justify-center">
          <StageRail variant="hero" />
        </div>

        <div className="max-w-[520px] text-center">
          <div className="text-[38px] font-semibold tracking-tight text-fg">Coase</div>
          <div className="mt-3 text-[15px] text-fg-muted">多智能体经济学实证研究助手</div>
          <div className="mt-2 text-[12px] text-fg-subtle">从研究设计到论文草稿 · 全流程陪跑</div>
        </div>

        <div className="mt-10 w-full max-w-[560px] space-y-2 text-[13px] leading-7 text-fg-muted">
          <div>
            输入 <span className="font-mono text-fg">/</span> 打开命令选择器，从五个工作流中挑一个开始：
            <span className="font-mono text-fg"> /full-research</span> ·
            <span className="font-mono text-fg"> /idea-to-results</span> ·
            <span className="font-mono text-fg"> /run-experiment</span> ·
            <span className="font-mono text-fg"> /paper-writing</span> ·
            <span className="font-mono text-fg"> /paper-review</span>
          </div>
          <div>
            想直接自由提问也行，Coase 会按任务自主调度方法技能与子代理。
          </div>
          <div>
            多模型对抗评审需要先在 <span className="font-mono text-fg">设置 → 评审模型组</span> 勾选 ≥ 2 个不同 provider。
          </div>
        </div>

        <div className="mt-8 text-center text-[11px] font-mono text-fg-subtle">
          Enter 发送 · Shift+Enter 换行
        </div>
      </div>
    </div>
  );
}
