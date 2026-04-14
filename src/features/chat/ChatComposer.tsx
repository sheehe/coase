// 底部输入区：承载大号 composer、skills 弹窗和轻量 provider 展示。
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowUp, Paperclip, RotateCcw, Square } from '../../components/Icons';
import Dialog from '../../components/ui/Dialog';
import Select from '../../components/ui/Select';
import type { ProviderRecord } from '../../../shared/providers';
import type { SkillInfo } from '../../../shared/skills';
import { useChat } from './ChatContext';

// TODO: 当前 provider 选择器依赖既有 providers IPC；本次仅接真实读取与 setActive。
export default function ChatComposer() {
  const {
    input,
    setInput,
    onSubmit,
    onCancel,
    onKeyDown,
    chatState,
    placeholder,
    sessionId,
    onNewSession,
    textareaRef,
    latestProvider,
    transcript,
  } = useChat();
  const [providers, setProviders] = useState<ProviderRecord[] | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillOpen, setSkillOpen] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '56px';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input, textareaRef]);

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const file = await window.coase.providers.list();
        if (!cancelled) setProviders(file.providers);
      } catch {
        if (!cancelled) setProviders(null);
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const openSkills = useCallback(async () => {
    setSkillOpen(true);
    try {
      const list = await window.coase.skills.list();
      setSkills(list);
    } catch (err) {
      console.error('load skills failed', err);
      setSkills([]);
    }
  }, []);

  const selectedProviderId = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const entry = transcript[i];
      if (entry.kind === 'provider') return entry.providerId ?? '';
    }
    return '';
  }, [transcript]);

  const providerLabel = useMemo(() => {
    if (latestProvider) return `${latestProvider.label} · ${latestProvider.model}`;
    if (!providers || providers.length === 0) return 'claude-opus-4-6';
    return `${providers[0]?.label} · ${providers[0]?.model}`;
  }, [latestProvider, providers]);

  const footerHint =
    chatState === 'idle'
      ? '按 Enter 开始一项新研究'
      : chatState === 'waiting'
        ? 'Enter 发送 · Shift+Enter 换行'
        : '正在调用 agent，⌘. 取消';

  return (
    <>
      <div className="border-t border-border bg-app px-6 pb-5 pt-4">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="relative rounded-3xl border border-border bg-surface shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            {sessionId !== null && chatState !== 'running' && (
              <button
                type="button"
                title="开新会话"
                onClick={() => void onNewSession()}
                className="absolute right-4 top-4 rounded-full p-2 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
              >
                <RotateCcw size={13} />
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={3}
              disabled={chatState === 'running'}
              className="min-h-[56px] max-h-[240px] w-full resize-none border-0 bg-transparent px-5 pt-4 text-[14px] text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-0"
            />

            <div className="flex items-center gap-2 px-3 pb-3">
              <button
                type="button"
                disabled
                title="数据集上传待实现"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-subtle transition disabled:cursor-not-allowed disabled:border-border disabled:text-fg-subtle"
              >
                <Paperclip size={15} />
              </button>

              {providers && providers.length > 0 ? (
                <Select
                  value={selectedProviderId || providers[0]?.id}
                  onChange={(e) => void window.coase.providers.setActive(e.target.value || null)}
                  className="w-auto min-w-[220px] rounded-full py-1.5 pl-3 pr-8 text-[12px] text-fg-muted"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label} · {provider.model}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="rounded-full border border-border px-3 py-1.5 text-[12px] text-fg-muted">
                  {providerLabel}
                </div>
              )}

              <button
                type="button"
                onClick={() => void openSkills()}
                className="rounded-full border border-border px-3 py-1.5 text-[12px] text-fg-muted transition hover:border-border-strong hover:text-fg"
              >
                /skills
              </button>

              <div className="ml-auto">
                {chatState === 'running' ? (
                  <button
                    type="button"
                    onClick={() => void onCancel()}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-danger/30 text-danger transition hover:bg-danger/5"
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!input.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-92 disabled:bg-border disabled:text-fg-subtle"
                  >
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 text-center text-[11px] text-fg-subtle">{footerHint}</div>
        </div>
      </div>

      <Dialog open={skillOpen} onClose={() => setSkillOpen(false)} title="可用 Skills">
        <div className="space-y-2">
          {skills.length === 0 ? (
            <div className="text-sm text-fg-subtle">暂无可展示的 skills</div>
          ) : (
            skills.map((skill) => (
              <div
                key={`${skill.source}:${skill.name}`}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <div className="text-sm font-medium text-fg">{skill.name}</div>
                <div className="mt-1 text-xs text-fg-subtle">{skill.description}</div>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </>
  );
}
