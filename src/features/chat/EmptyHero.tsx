// 空会话 Hero：强调产品定位和建议起手式。
import { useChat } from './ChatContext';
import SuggestionStarters from './SuggestionStarters';

export default function EmptyHero() {
  const { setInput, textareaRef } = useChat();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <div className="text-[44px] font-semibold tracking-tight text-fg">Coase</div>
        <div className="mt-3 text-[15px] text-fg-muted">多智能体经济学实证研究助手</div>
        <div className="mt-2 text-[12px] text-fg-subtle">从研究设计到论文草稿 · 全流程陪跑</div>
      </div>

      <SuggestionStarters
        onPick={(text) => {
          setInput(text);
          textareaRef.current?.focus();
        }}
      />

      <div className="text-center text-[11px] font-mono text-fg-subtle">
        Enter 发送 · Shift+Enter 换行 · / 触发技能 · @ 引用文件 · ⌘K 命令面板
      </div>
    </div>
  );
}
