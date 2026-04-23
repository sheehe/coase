// 底部输入区：把研究输入、附件、模型和上下文提示收敛成单一主操作台。
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AttachmentKind } from '../../../shared/ipc';
import type { ProviderRecord } from '../../../shared/providers';
import type { SkillInfo } from '../../../shared/skills';
import {
  AlertCircle,
  ArrowUp,
  Box,
  Check,
  Paperclip,
  RotateCcw,
  Square,
  Workflow,
  X,
} from '../../components/Icons';
import Select from '../../components/ui/Select';
import { useChat } from './ChatContext';
import {
  buildSlashCommands,
  filterSlashCommands,
  findSlashTriggerMatch,
  type SlashCommandDef,
} from './slash-commands';

const ATTACHMENT_ACTIONS: Array<{
  kind: AttachmentKind;
  title: string;
  description: string;
}> = [
  {
    kind: 'dataset_folder',
    title: '添加数据集文件夹',
    description: '告诉 agent 数据集目录在哪，让它自行读取和检索。',
  },
  {
    kind: 'data_file',
    title: '添加数据文件',
    description: '附加单个或多个数据文件，例如 CSV、Excel、Stata、Parquet。',
  },
  {
    kind: 'paper_file',
    title: '添加参考论文',
    description: '附加 PDF、TeX、Bib 或文稿，让 agent 自行阅读并引用。',
  },
  {
    kind: 'other_file',
    title: '添加其他文件',
    description: '附加补充材料、说明文档、代码、附录或任意其他本地文件。',
  },
];

function formatCompactTokens(value: number) {
  if (value >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }
  return `${value}`;
}

function resolveUsedTokens(
  totalTokens: number,
  contextUsage?: {
    totalTokens: number;
  } | null,
) {
  return contextUsage?.totalTokens ?? totalTokens;
}

function attachmentKindLabel(kind: AttachmentKind) {
  switch (kind) {
    case 'dataset_folder':
      return '数据集文件夹';
    case 'data_file':
      return '数据文件';
    case 'paper_file':
      return '参考论文';
    default:
      return '其他文件';
  }
}

export default function ChatComposer() {
  const {
    input,
    setInput,
    onSubmit,
    onCancel,
    onKeyDown,
    chatState,
    runStatus,
    placeholder,
    sessionId,
    onNewSession,
    textareaRef,
    latestProvider,
    transcript,
    guidanceHistory,
    contextUsage,
    totalTokens,
    attachments,
    addAttachments,
    removeAttachment,
    selectedCommands,
    addSelectedCommand,
    removeSelectedCommand,
  } = useChat();

  const [providers, setProviders] = useState<ProviderRecord[] | null>(null);
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [attachmentPanelOpen, setAttachmentPanelOpen] = useState(false);
  const [workflowPanelOpen, setWorkflowPanelOpen] = useState(false);
  const [pickingKind, setPickingKind] = useState<AttachmentKind | null>(null);
  const [highlightedCommandIndex, setHighlightedCommandIndex] = useState(0);
  const [caretPosition, setCaretPosition] = useState(0);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentPanelRef = useRef<HTMLDivElement>(null);
  const workflowButtonRef = useRef<HTMLButtonElement>(null);
  const workflowPanelRef = useRef<HTMLDivElement>(null);
  const commandPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '48px';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input, textareaRef]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [providerFile, skillList] = await Promise.all([
          window.coase.providers.list(),
          window.coase.skills.list(),
        ]);
        if (!cancelled) {
          setProviders(providerFile.providers);
          setSkills(skillList);
        }
      } catch {
        if (!cancelled) {
          setProviders(null);
          setSkills(null);
        }
      }
    };
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!attachmentPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (attachmentPanelRef.current?.contains(target)) return;
      if (attachmentButtonRef.current?.contains(target)) return;
      setAttachmentPanelOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachmentPanelOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachmentPanelOpen]);

  useEffect(() => {
    if (!workflowPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (workflowPanelRef.current?.contains(target)) return;
      if (workflowButtonRef.current?.contains(target)) return;
      setWorkflowPanelOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkflowPanelOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [workflowPanelOpen]);

  const slashCommands = useMemo(() => buildSlashCommands(skills ?? []), [skills]);
  // 工作流图标菜单里只列"alias 型工作流"（full-research / idea-to-results /
  // run-experiment / review），不列从 skill 派生出的 workflow，避免菜单
  // 里冒出一堆用户不认得的底层 workflow skill。
  const workflowCommands = useMemo(
    () => slashCommands.filter((c) => c.kind === 'workflow' && c.source === 'alias'),
    [slashCommands],
  );
  const selectedCommandIds = useMemo(
    () => new Set(selectedCommands.map((c) => c.id)),
    [selectedCommands],
  );
  const slashMatch = useMemo(
    () => findSlashTriggerMatch(input, caretPosition),
    [input, caretPosition],
  );
  const visibleSlashCommands = useMemo(
    () => filterSlashCommands(slashCommands, slashMatch?.query ?? ''),
    [slashCommands, slashMatch?.query],
  );
  const slashPickerOpen = !!slashMatch && visibleSlashCommands.length > 0;

  useEffect(() => {
    setHighlightedCommandIndex(0);
  }, [slashMatch?.query]);

  const selectedProviderId = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const entry = transcript[i];
      if (entry.kind === 'provider') return entry.providerId ?? '';
    }
    return '';
  }, [transcript]);

  const providerLabel = useMemo(() => {
    if (latestProvider) return latestProvider.model;
    if (!providers || providers.length === 0) return 'claude-opus-4-6';
    return providers[0]?.model ?? 'claude-opus-4-6';
  }, [latestProvider, providers]);

  const providerSelectWidth = `${Math.max(providerLabel.length + 6, 14)}ch`;

  const footerHint =
    runStatus === 'awaiting_user_guidance'
      ? '输入指导意见后按 Enter，Coase 会在当前研究基础上继续。'
      : runStatus === 'completed'
        ? '结果已生成；你仍可继续给出修改建议。'
        : chatState === 'idle'
          ? '按 Enter 开始一项新研究'
          : chatState === 'waiting'
            ? 'Enter 发送 · Shift+Enter 换行'
            : '自动研究正在运行，可通过右侧暂停按钮打断';

  const actualContextWindowTokens = contextUsage?.maxTokens ?? contextUsage?.rawMaxTokens;
  const fallbackContextWindowTokens = Math.max(resolveUsedTokens(totalTokens, contextUsage), 1);
  const displayContextWindowTokens = actualContextWindowTokens ?? fallbackContextWindowTokens;
  const usedTokens = resolveUsedTokens(totalTokens, contextUsage);
  const usedPercentage = Math.min(
    100,
    contextUsage?.percentage ?? (usedTokens / displayContextWindowTokens) * 100,
  );
  const usedPercentText = `${Math.round(usedPercentage)}%`;
  const contextWindowText = formatCompactTokens(displayContextWindowTokens);
  const usedTokensText = formatCompactTokens(usedTokens);
  const topCategories = (contextUsage?.categories ?? [])
    .filter((category) => category.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 4);

  const pickAttachment = async (kind: AttachmentKind) => {
    setAttachmentPanelOpen(false);
    setPickingKind(kind);
    try {
      const paths = await window.coase.files.pick(kind);
      addAttachments(kind, paths);
    } catch (error) {
      console.error('pick attachment failed', { kind, error });
    } finally {
      setPickingKind(null);
    }
  };

  const toggleWorkflow = (command: SlashCommandDef) => {
    if (selectedCommandIds.has(command.id)) {
      removeSelectedCommand(command.id);
    } else {
      addSelectedCommand({
        id: command.id,
        trigger: command.trigger,
        title: command.title,
        description: command.description,
        kind: command.kind,
        sourceLabel: command.sourceLabel,
        targetSkills: command.targetSkills,
        guidance: command.guidance,
      });
    }
    setWorkflowPanelOpen(false);
  };

  const replaceSlashTriggerWithSelection = (command: SlashCommandDef) => {
    if (!slashMatch) return;
    addSelectedCommand({
      id: command.id,
      trigger: command.trigger,
      title: command.title,
      description: command.description,
      kind: command.kind,
      sourceLabel: command.sourceLabel,
      targetSkills: command.targetSkills,
      guidance: command.guidance,
    });

    const nextInput = `${input.slice(0, slashMatch.start)}${input.slice(slashMatch.end)}`;
    const normalizedInput = nextInput.replace(/\s{2,}/g, ' ');
    const nextCaret = Math.min(slashMatch.start, normalizedInput.length);

    setInput(normalizedInput);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaretPosition(nextCaret);
    });
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashPickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedCommandIndex((index) =>
          Math.min(index + 1, visibleSlashCommands.length - 1),
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedCommandIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const candidate = visibleSlashCommands[highlightedCommandIndex];
        if (candidate) replaceSlashTriggerWithSelection(candidate);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        const el = textareaRef.current;
        if (!el || !slashMatch) return;
        el.setSelectionRange(slashMatch.end, slashMatch.end);
        setCaretPosition(slashMatch.end);
        return;
      }
    }

    if (e.key === 'Backspace' && !input && selectedCommands.length > 0) {
      e.preventDefault();
      removeSelectedCommand(selectedCommands[selectedCommands.length - 1]?.id ?? '');
      return;
    }

    onKeyDown(e);
  };

  return (
    <div className="border-t border-border bg-app px-6 pb-5 pt-4">
      <div className="relative mx-auto w-full max-w-[820px]">
        {slashPickerOpen && (
          <div
            ref={commandPanelRef}
            className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-40 overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2 text-[13px] text-fg">
              <span className="font-medium">技能</span>
            </div>
            <div className="slash-command-scroll max-h-[320px] overflow-y-auto py-0.5">
              {visibleSlashCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    replaceSlashTriggerWithSelection(command);
                  }}
                  className={`slash-command-row block w-full px-4 py-1.5 text-left ${
                    index === highlightedCommandIndex
                      ? 'is-active bg-[color:color-mix(in_srgb,var(--color-fg)_5%,white)]'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-fg-muted">
                      <Box size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2.5">
                        <span className="shrink-0 text-[14px] leading-5 text-fg">
                          {command.title}
                        </span>
                        <span className="min-w-0 truncate text-[14px] leading-5 text-fg-muted">
                          {command.description}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] text-fg-muted">
                      {command.sourceLabel}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="relative overflow-visible rounded-[28px] border border-border/80 bg-surface shadow-[0_6px_24px_rgba(0,0,0,0.03)]">
          {sessionId !== null && chatState !== 'running' && (
            <button
              type="button"
              title="开始新研究"
              onClick={() => void onNewSession()}
              className="absolute right-4 top-4 rounded-full p-1.5 text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
            >
              <RotateCcw size={12} />
            </button>
          )}

          {runStatus === 'awaiting_user_guidance' && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-2xl border border-border bg-app px-3 py-2 text-[12px] text-fg-muted">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div>
                <div className="font-medium text-fg">当前自动运行已暂停</div>
                <div className="mt-0.5">直接输入你的纠偏建议，Coase 会在既有研究记忆上继续。</div>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            onClick={(e) => setCaretPosition(e.currentTarget.selectionStart ?? 0)}
            onKeyUp={(e) => setCaretPosition(e.currentTarget.selectionStart ?? 0)}
            onSelect={(e) => setCaretPosition(e.currentTarget.selectionStart ?? 0)}
            placeholder={placeholder}
            rows={3}
            className="min-h-[52px] max-h-[220px] w-full resize-none border-0 bg-transparent px-5 pb-1 pt-4 text-[14px] leading-7 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-0"
          />

          {selectedCommands.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-1">
              {selectedCommands.map((command) => (
                <div
                  key={command.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-app px-3 py-1 text-[12px] text-fg"
                  title={command.description}
                >
                  <Box size={12} className="shrink-0 text-fg-subtle" />
                  <span className="font-medium">{command.title}</span>
                  <span className="text-[11px] text-fg-subtle">{command.trigger}</span>
                  <span className="text-[11px] text-fg-subtle">
                    {command.sourceLabel}
                  </span>
                  <button
                    type="button"
                    aria-label={`移除 ${command.title}`}
                    onClick={() => removeSelectedCommand(command.id)}
                    className="shrink-0 text-fg-subtle transition hover:text-fg"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-app px-3 py-1 text-[11px] text-fg-muted"
                  title={attachment.path}
                >
                  <span className="shrink-0 text-fg-subtle">{attachmentKindLabel(attachment.kind)}</span>
                  <span className="truncate text-fg">{attachment.name}</span>
                  <button
                    type="button"
                    aria-label="移除附件"
                    onClick={() => removeAttachment(attachment.id)}
                    className="shrink-0 text-fg-subtle transition hover:text-fg"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border/70 px-4 py-3">
            <div className="relative">
              <button
                ref={attachmentButtonRef}
                type="button"
                data-coach-attachments
                onClick={() => setAttachmentPanelOpen((open) => !open)}
                title="添加本地文件"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04] ${
                  attachmentPanelOpen ? 'bg-black/[0.04] text-fg dark:bg-white/[0.04]' : ''
                }`}
              >
                <Paperclip size={14} />
              </button>

              {attachmentPanelOpen && (
                <div
                  ref={attachmentPanelRef}
                  className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-[420px] overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
                >
                  <div className="border-b border-border/80 px-4 py-2 text-[13px] text-fg">
                    <span className="font-medium">添加本地文件</span>
                  </div>

                  <div className="py-1">
                    {ATTACHMENT_ACTIONS.map((action) => (
                      <button
                        key={action.kind}
                        type="button"
                        onClick={() => void pickAttachment(action.kind)}
                        disabled={pickingKind !== null}
                        className="block w-full px-4 py-2 text-left transition hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-70 dark:hover:bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-fg-muted">
                            <Paperclip size={11} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2.5">
                              <span className="shrink-0 text-[14px] leading-5 text-fg">
                                {action.title}
                              </span>
                              <span className="min-w-0 truncate text-[13px] leading-5 text-fg-muted">
                                {action.description}
                              </span>
                            </div>
                          </div>
                          {pickingKind === action.kind ? (
                            <div className="shrink-0 text-[11px] text-fg-muted">选择中…</div>
                          ) : (
                            <div className="shrink-0 text-[12px] text-fg-muted">本地</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 工作流图标入口：和斜杠命令选择器并存，复用 selectedCommands 机制， */}
            {/* 发送时由 injectSlashCommandContext 注入对应工作流的 guidance。 */}
            {workflowCommands.length > 0 && (
              <div className="relative">
                <button
                  ref={workflowButtonRef}
                  type="button"
                  onClick={() => setWorkflowPanelOpen((open) => !open)}
                  title="选择工作流"
                  aria-label="选择工作流"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04] ${
                    workflowPanelOpen || selectedCommands.length > 0
                      ? 'bg-black/[0.04] text-fg dark:bg-white/[0.04]'
                      : ''
                  }`}
                >
                  <Workflow size={14} />
                </button>

                {workflowPanelOpen && (
                  <div
                    ref={workflowPanelRef}
                    className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-[460px] overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
                  >
                    <div className="border-b border-border/80 px-4 py-2 text-[13px] text-fg">
                      <span className="font-medium">选择工作流</span>
                      <span className="ml-2 text-[11px] text-fg-subtle">
                        也可以直接在输入框里用 / 触发
                      </span>
                    </div>

                    <div className="py-1">
                      {workflowCommands.map((command) => {
                        const active = selectedCommandIds.has(command.id);
                        return (
                          <button
                            key={command.id}
                            type="button"
                            onClick={() => toggleWorkflow(command)}
                            className={`block w-full px-4 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03] ${
                              active ? 'bg-accent/[0.08] dark:bg-accent/[0.12]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-fg-muted">
                                {active ? (
                                  <Check size={12} className="text-accent" />
                                ) : (
                                  <Workflow size={12} />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2.5">
                                  <span className="shrink-0 text-[14px] leading-5 text-fg">
                                    {command.title}
                                  </span>
                                  <span className="min-w-0 truncate text-[13px] leading-5 text-fg-muted">
                                    {command.description}
                                  </span>
                                </div>
                              </div>
                              <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                                {command.trigger}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {providers && providers.length > 0 ? (
              <div
                data-coach-provider
                className="inline-flex items-center rounded-lg border border-transparent px-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              >
                <Select
                  value={selectedProviderId || providers[0]?.id}
                  onChange={(e) => void window.coase.providers.setActive(e.target.value || null)}
                  style={{ width: providerSelectWidth }}
                  className="w-auto min-w-0 max-w-none border-0 bg-transparent py-0 pl-0 pr-5 text-[12px] font-medium text-fg shadow-none hover:bg-transparent focus:bg-transparent"
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.model}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div
                data-coach-provider
                className="inline-flex items-center rounded-lg border border-transparent px-1"
              >
                <div className="py-0 text-[12px] font-medium text-fg">{providerLabel}</div>
              </div>
            )}

            <div className="group relative ml-auto">
              <div
                title="上下文窗口"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface"
              >
                <div
                  className="h-3.5 w-3.5 rounded-full"
                  style={{
                    background: `conic-gradient(var(--color-accent) 0deg ${(usedPercentage / 100) * 360}deg, color-mix(in srgb, var(--color-fg) 12%, transparent) ${(usedPercentage / 100) * 360}deg 360deg)`,
                  }}
                />
                <div className="absolute h-2 w-2 rounded-full bg-surface" />
              </div>

              <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 hidden w-[250px] -translate-x-1/2 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm group-hover:block">
                <div className="text-[12px] font-medium text-fg">背景信息窗口：{usedPercentText}</div>
                <div className="mt-2 text-[12px] text-fg">
                  已用 {usedTokensText} 标记，共 {contextWindowText}
                </div>
                <div className="mt-2 text-[11px] text-fg-subtle">Coase 会自动管理背景信息窗口</div>
                {topCategories.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {topCategories.map((category) => (
                      <div
                        key={category.name}
                        className="flex items-center justify-between text-[11px] text-fg-subtle"
                      >
                        <span className="truncate pr-3">{category.name}</span>
                        <span>{formatCompactTokens(category.tokens)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {chatState === 'running' ? (
              <button
                type="button"
                data-coach-send
                onClick={() => void onCancel()}
                title="终止本次研究"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-danger/30 text-danger transition hover:bg-danger/5"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="button"
                data-coach-send
                onClick={onSubmit}
                disabled={!input.trim() && selectedCommands.length === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-92 disabled:bg-border disabled:text-fg-subtle"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 text-center text-[11px] text-fg-subtle">{footerHint}</div>
        {guidanceHistory.length > 0 && (
          <div className="mt-1 text-center text-[11px] text-fg-subtle">
            已记录 {guidanceHistory.length} 条指导
          </div>
        )}
      </div>
    </div>
  );
}
