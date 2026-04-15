// 空会话 Hero：收紧品牌信息，把研究入口模板和输入动作组织成统一首页。
import StageRail from '../../layouts/StageRail';
import { useChat } from './ChatContext';
import SuggestionStarters from './SuggestionStarters';

export default function EmptyHero() {
  const { setInput, textareaRef } = useChat();

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

        <div className="mt-9">
          <SuggestionStarters
            onPick={(text) => {
              setInput(text);
              textareaRef.current?.focus();
            }}
          />
        </div>

        <div className="mt-8 text-center text-[11px] font-mono text-fg-subtle">
          Enter 发送 · Shift+Enter 换行
        </div>
      </div>
    </div>
  );
}
