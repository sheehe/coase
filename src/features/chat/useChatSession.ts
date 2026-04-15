// 会话状态 Hook：承载聊天、可打断运行、SDK 原生续跑与运行洞察。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AttachedPath,
  AttachmentKind,
  ChatEvent,
  RunInsightsPersisted,
  TranscriptEntryPersisted,
  Unsubscribe,
} from '../../../shared/ipc';
import type { SessionLogEntry } from '../../../shared/runs';
import type { TranscriptEntry } from './TranscriptMessage';
import { deriveRunInsights, type ArtifactRecord, type MilestoneRecord } from './run-insights';
import {
  injectSlashCommandContext,
  type SelectedSlashCommand,
} from './slash-commands';

type ChatState = 'idle' | 'running' | 'waiting';
type InferredStage = 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer' | 'idle';
type RunStatus =
  | 'idle'
  | 'running'
  | 'awaiting_user_guidance'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GuidanceRecord {
  id: string;
  ts: number;
  text: string;
}

export interface ComposerAttachment extends AttachedPath {
  id: string;
  name: string;
}

export interface ChatSessionValue {
  runId: string | null;
  runStatus: RunStatus;
  sessionId: string | null;
  workspaceRoot: string | null;
  workspaceMode: 'auto' | 'custom';
  chatState: ChatState;
  transcript: TranscriptEntry[];
  input: string;
  latestProvider: { label: string; model: string; baseURL?: string } | null;
  latestTurnMetrics: {
    ok: boolean;
    turns?: number;
    durationMs?: number;
    costUsd?: number;
  } | null;
  totalTokens: number;
  contextUsage: {
    totalTokens: number;
    maxTokens: number;
    rawMaxTokens: number;
    percentage: number;
    model?: string;
    categories: Array<{
      name: string;
      tokens: number;
      color: string;
      isDeferred?: boolean;
    }>;
  } | null;
  inferredStage: InferredStage;
  currentMilestone: string;
  artifactCount: number;
  milestones: MilestoneRecord[];
  artifacts: ArtifactRecord[];
  attachments: ComposerAttachment[];
  selectedCommands: SelectedSlashCommand[];
  guidanceHistory: GuidanceRecord[];
  summaryRefreshKey: number;
  setInput: (value: string) => void;
  addAttachments: (kind: AttachmentKind, paths: string[]) => void;
  removeAttachment: (id: string) => void;
  addSelectedCommand: (command: SelectedSlashCommand) => void;
  removeSelectedCommand: (id: string) => void;
  clearSelectedCommands: () => void;
  chooseWorkspaceRoot: () => Promise<void>;
  resetWorkspaceRoot: () => void;
  onSubmit: () => void;
  onCancel: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onNewSession: () => Promise<void>;
  openHistoricalSession: (session: SessionLogEntry) => Promise<void>;
  resumeHistoricalSession: (session: SessionLogEntry) => Promise<void>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}

export function useChatSession(): ChatSessionValue {
  const [input, setInput] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sdkSessionId, setSdkSessionId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [contextUsage, setContextUsage] = useState<ChatSessionValue['contextUsage']>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedCommands, setSelectedCommands] = useState<SelectedSlashCommand[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'auto' | 'custom'>('auto');

  const scrollRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  const handleEvent = useCallback(
    (ev: ChatEvent) => {
      const ts = Date.now();
      let nextTranscriptSnapshot: TranscriptEntry[] = [];

      setTranscript((prev) => {
        switch (ev.type) {
          case 'session_started':
            nextTranscriptSnapshot = [
              ...prev,
              { kind: 'status', ts, text: '研究已启动，自动运行中' },
            ];
            return nextTranscriptSnapshot;
          case 'sdk_session_bound':
            setSdkSessionId(ev.sdkSessionId);
            return prev;
          case 'status_message': {
            // Back-compat: status-prefixed subagent messages still arrive from
            // legacy code paths. Keep parsing them into subagent entries so we
            // don't regress.
            const subagentEntry = parseSubagentStatusMessage(ev.text, ts);
            nextTranscriptSnapshot = [
              ...prev,
              subagentEntry ?? { kind: 'status', ts, text: ev.text },
            ];
            return nextTranscriptSnapshot;
          }
          case 'subagent': {
            // Consolidate consecutive progress pings for the same task so the
            // "Subagent RUNNING" pill updates in place instead of stacking.
            if (ev.phase === 'progress' && ev.taskId) {
              const idx = findLastSubagentByTask(prev, ev.taskId);
              const existing = idx >= 0 ? prev[idx] : undefined;
              if (existing && existing.kind === 'subagent' && existing.phase === 'progress') {
                const next = prev.slice();
                next[idx] = {
                  ...existing,
                  ts,
                  text: ev.text,
                  description: ev.description,
                  lastToolName: ev.lastToolName,
                  toolUses: ev.toolUses,
                  durationMs: ev.durationMs,
                  totalTokens: ev.totalTokens,
                };
                nextTranscriptSnapshot = next;
                return next;
              }
            }
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'subagent',
                ts,
                phase: ev.phase,
                text: ev.text,
                taskId: ev.taskId,
                description: ev.description,
                lastToolName: ev.lastToolName,
                toolUses: ev.toolUses,
                durationMs: ev.durationMs,
                totalTokens: ev.totalTokens,
              },
            ];
            return nextTranscriptSnapshot;
          }
          case 'session_finished':
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'status',
                ts,
                text:
                  ev.reason === 'user_interrupt'
                    ? '研究已暂停，等待你的指导'
                    : ev.reason === 'user_cancel'
                      ? '研究已终止'
                      : ev.reason === 'error'
                        ? '研究因错误中止'
                        : '研究已完成当前自动运行',
              },
            ];
            return nextTranscriptSnapshot;
          case 'provider': {
            const label = ev.providerLabel ?? (ev.source === 'env' ? '环境变量回退' : '未命名');
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'provider',
                ts,
                text: `使用 ${label} · ${ev.model}${ev.baseURL ? ` · ${ev.baseURL}` : ''}`,
                providerId: ev.providerId,
                providerLabel: ev.providerLabel,
                model: ev.model,
                baseURL: ev.baseURL,
              },
            ];
            return nextTranscriptSnapshot;
          }
          case 'user_message_accepted':
            nextTranscriptSnapshot = [...prev, { kind: 'user', ts, text: ev.text }];
            return nextTranscriptSnapshot;
          case 'assistant_text': {
            // Finalize the streaming buffer (if any) for this messageId; the
            // SDK's authoritative assistant message carries the full text.
            const idx = ev.messageId ? findLastAssistantByMessageId(prev, ev.messageId) : -1;
            if (idx >= 0) {
              const existing = prev[idx];
              if (existing.kind === 'assistant') {
                const next = prev.slice();
                next[idx] = {
                  ...existing,
                  ts,
                  text: ev.text,
                  messageId: ev.messageId,
                  streaming: false,
                };
                nextTranscriptSnapshot = next;
                return next;
              }
            }
            nextTranscriptSnapshot = [
              ...prev,
              { kind: 'assistant', ts, text: ev.text, messageId: ev.messageId },
            ];
            return nextTranscriptSnapshot;
          }
          case 'assistant_text_delta': {
            const idx = findLastAssistantByMessageId(prev, ev.messageId);
            if (idx >= 0) {
              const existing = prev[idx];
              if (existing.kind === 'assistant') {
                const next = prev.slice();
                next[idx] = {
                  ...existing,
                  text: `${existing.text}${ev.delta}`,
                  streaming: true,
                };
                nextTranscriptSnapshot = next;
                return next;
              }
            }
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'assistant',
                ts,
                text: ev.delta,
                messageId: ev.messageId,
                streaming: true,
              },
            ];
            return nextTranscriptSnapshot;
          }
          case 'assistant_thinking': {
            // Dedupe by messageId so streaming deltas and the final
            // authoritative thinking block land in the same pill.
            const idx = ev.messageId ? findLastThinkingByMessageId(prev, ev.messageId) : -1;
            if (idx >= 0) {
              const existing = prev[idx];
              if (existing.kind === 'thinking') {
                const next = prev.slice();
                next[idx] = { ...existing, ts, text: ev.text };
                nextTranscriptSnapshot = next;
                return next;
              }
            }
            nextTranscriptSnapshot = [
              ...prev,
              { kind: 'thinking', ts, text: ev.text, messageId: ev.messageId },
            ];
            return nextTranscriptSnapshot;
          }
          case 'tool_use':
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'tool_use',
                ts,
                name: ev.name,
                input: ev.input,
                toolUseId: ev.toolUseId,
                parentToolUseId: ev.parentToolUseId ?? null,
                status: 'running',
              },
            ];
            return nextTranscriptSnapshot;
          case 'tool_progress': {
            const idx = findLastToolUseById(prev, ev.toolUseId);
            if (idx < 0) return prev;
            const existing = prev[idx];
            if (existing.kind !== 'tool_use') return prev;
            const next = prev.slice();
            next[idx] = {
              ...existing,
              elapsedSeconds: ev.elapsedSeconds,
              status: 'running',
            };
            nextTranscriptSnapshot = next;
            return next;
          }
          case 'tool_result': {
            // Mark the matching running tool_use as done (live timer stops).
            let working = prev;
            if (ev.toolUseId) {
              const idx = findLastToolUseById(prev, ev.toolUseId);
              if (idx >= 0) {
                const existing = prev[idx];
                if (existing.kind === 'tool_use') {
                  const next = prev.slice();
                  next[idx] = { ...existing, status: 'done' };
                  working = next;
                }
              }
            }
            nextTranscriptSnapshot = [
              ...working,
              {
                kind: 'tool_result',
                ts,
                text: ev.text,
                isError: ev.isError,
                toolUseId: ev.toolUseId,
              },
            ];
            return nextTranscriptSnapshot;
          }
          case 'context_usage':
            setContextUsage({
              totalTokens: ev.total_tokens,
              maxTokens: ev.max_tokens,
              rawMaxTokens: ev.raw_max_tokens,
              percentage: ev.percentage,
              model: ev.model,
              categories: ev.categories,
            });
            return prev;
          case 'error':
            nextTranscriptSnapshot = [...prev, { kind: 'error', ts, text: ev.message }];
            return nextTranscriptSnapshot;
          case 'turn_result': {
            const parts: string[] = [];
            if (typeof ev.num_turns === 'number') parts.push(`turns=${ev.num_turns}`);
            if (typeof ev.duration_ms === 'number') {
              parts.push(`duration=${(ev.duration_ms / 1000).toFixed(1)}s`);
            }
            if (typeof ev.cost_usd === 'number') parts.push(`cost=$${ev.cost_usd.toFixed(4)}`);
            if (typeof ev.total_tokens === 'number') parts.push(`tokens=${ev.total_tokens}`);
            if (!ev.ok && ev.subtype) parts.push(`subtype=${ev.subtype}`);
            if (!ev.ok && ev.errors?.length) parts.push(ev.errors.join('; '));
            nextTranscriptSnapshot = [
              ...prev,
              {
                kind: 'turn_result',
                ts,
                ok: ev.ok,
                detail: parts.join(' · '),
                turns: ev.num_turns,
                durationMs: ev.duration_ms,
                costUsd: ev.cost_usd,
                totalTokens: ev.total_tokens,
                inputTokens: ev.input_tokens,
                outputTokens: ev.output_tokens,
                cacheCreationInputTokens: ev.cache_creation_input_tokens,
                cacheReadInputTokens: ev.cache_read_input_tokens,
              },
            ];
            return nextTranscriptSnapshot;
          }
          default:
            return prev;
        }
      });

      if (ev.type === 'session_started') {
        // 会话一启动就让侧边栏拉一次 sessions.recent()，这样运行中的会话
        // 能立刻在侧边栏露头，而不是等到 session_finished 才出现。
        setSummaryRefreshKey((key) => key + 1);
      } else if (ev.type === 'turn_result') {
        setChatState('waiting');
        setRunStatus('running');
        // 每个 agent turn 结束都顺手持久化一次 transcript / insights，降低
        // 崩溃或强退时丢失研究记录的风险。原先只在 session_finished 时才写入，
        // 一旦主进程异常退出，整段对话全丢。
        const activeSessionId = sessionIdRef.current;
        if (activeSessionId) {
          const snapshot = transcriptRef.current;
          if (snapshot.length > 0) {
            void persistTranscriptSnapshot(activeSessionId, snapshot);
            void persistInsightsSnapshot(activeSessionId, deriveRunInsights(snapshot));
          }
        }
      } else if (ev.type === 'session_finished') {
        const finishedSessionId = sessionIdRef.current;
        if (finishedSessionId && nextTranscriptSnapshot.length > 0) {
          void persistTranscriptSnapshot(finishedSessionId, nextTranscriptSnapshot);
          void persistInsightsSnapshot(
            finishedSessionId,
            deriveRunInsights(nextTranscriptSnapshot),
          );
        }
        setChatState('idle');
        setSessionId(null);
        setContextUsage(null);
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        sessionIdRef.current = null;
        setSummaryRefreshKey((key) => key + 1);

        if (ev.reason === 'user_interrupt') {
          setRunStatus('awaiting_user_guidance');
        } else if (ev.reason === 'user_cancel') {
          setRunStatus('cancelled');
        } else if (ev.reason === 'error') {
          setRunStatus('failed');
        } else {
          setRunStatus('completed');
        }
      }
    },
    [],
  );

  const startSession = useCallback(
    async (
      displayMessage: string,
      runtimeMessage: string,
      mode: 'fresh' | 'resume',
      attachmentsForMessage: AttachedPath[],
    ) => {
      if (mode === 'fresh') {
        setTranscript([]);
        setRunId(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
        setSdkSessionId(null);
      }

      setChatState('running');
      setRunStatus('running');

      try {
        const outcome =
          mode === 'fresh'
            ? await window.coase.chat.start({
                text: runtimeMessage,
                displayText: displayMessage,
                attachments: attachmentsForMessage,
                workspaceRoot: workspaceMode === 'custom' ? workspaceRoot ?? undefined : undefined,
              })
            : await window.coase.chat.resume({
                sdkSessionId: sdkSessionId ?? '',
                guidance: runtimeMessage,
                displayGuidance: displayMessage,
                attachments: attachmentsForMessage,
                workspaceRoot: workspaceMode === 'custom' ? workspaceRoot ?? undefined : undefined,
              });
        setSessionId(outcome.sessionId);
        setWorkspaceRoot(outcome.workspaceRoot);
        unsubscribeRef.current = window.coase.chat.onEvent(outcome.sessionId, handleEvent);
      } catch (err) {
        setChatState('idle');
        setSessionId(null);
        setRunStatus(mode === 'resume' ? 'awaiting_user_guidance' : 'failed');
        setTranscript((prev) => [
          ...prev,
          {
            kind: 'error',
            ts: Date.now(),
            text: err instanceof Error ? err.message : String(err),
          },
        ]);
      }
    },
    [handleEvent, sdkSessionId, workspaceMode, workspaceRoot],
  );

  const sendFollowup = useCallback(
    async (
      sid: string,
      displayText: string,
      runtimeText: string,
      attachmentsForMessage: AttachedPath[],
    ) => {
    setChatState('running');
    setRunStatus('running');
    try {
      await window.coase.chat.send(sid, {
        text: runtimeText,
        displayText,
        attachments: attachmentsForMessage,
      });
    } catch (err) {
      setChatState('waiting');
      setRunStatus('failed');
      setTranscript((prev) => [
        ...prev,
        {
          kind: 'error',
          ts: Date.now(),
          text: err instanceof Error ? err.message : String(err),
        },
        ]);
      }
    },
    [],
  );

  const onSubmit = useCallback(() => {
    const text = input.trim();
    if ((!text && selectedCommands.length === 0) || chatState === 'running') return;

    setInput('');
    const submittedCommands = selectedCommands;
    setSelectedCommands([]);
    const submittedAttachments = attachments.map(({ kind, path }) => ({ kind, path }));
    setAttachments([]);
    const visibleText = withAttachmentSummary(text, attachments);
    const commandAwareText = injectSlashCommandContext(visibleText, submittedCommands);

    if (
      (runStatus === 'awaiting_user_guidance' || runStatus === 'completed') &&
      transcript.length > 0 &&
      runId &&
      sdkSessionId
    ) {
      const guidanceEntry: TranscriptEntry = {
        kind: 'guidance',
        ts: Date.now(),
        text: visibleText,
      };
      setTranscript((prev) => [...prev, guidanceEntry]);
      void startSession(visibleText, commandAwareText, 'resume', submittedAttachments);
      return;
    }

    if (chatState === 'idle' || !sessionId) {
      void startSession(visibleText, commandAwareText, 'fresh', submittedAttachments);
    } else {
      void sendFollowup(sessionId, visibleText, commandAwareText, submittedAttachments);
    }
  }, [
    attachments,
    input,
    chatState,
    runStatus,
    transcript.length,
    runId,
    sdkSessionId,
    sessionId,
    selectedCommands,
    startSession,
    sendFollowup,
  ]);

  const onCancel = useCallback(async () => {
    if (!sessionId) return;
    await window.coase.chat.cancel(sessionId);
  }, [sessionId]);

  const onInterrupt = useCallback(async () => {
    if (!sessionId) return;
    await window.coase.chat.interrupt(sessionId);
  }, [sessionId]);

  const chooseWorkspaceRoot = useCallback(async () => {
    const picked = await window.coase.workspaces.pickDirectory();
    if (!picked) return;
    setWorkspaceRoot(picked);
    setWorkspaceMode('custom');
  }, []);

  const resetWorkspaceRoot = useCallback(() => {
    setWorkspaceRoot(null);
    setWorkspaceMode('auto');
  }, []);

  const onNewSession = useCallback(async () => {
    if (sessionId) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      sessionIdRef.current = null;
      if (transcript.length > 0) {
        await persistTranscriptSnapshot(sessionId, transcript);
        await persistInsightsSnapshot(sessionId, deriveRunInsights(transcript));
      }
      await window.coase.chat.cancel(sessionId);
    }
    setInput('');
    setRunId(null);
    setSdkSessionId(null);
    setTranscript([]);
    setAttachments([]);
    setSelectedCommands([]);
    setSessionId(null);
    setContextUsage(null);
    if (workspaceMode === 'auto') {
      setWorkspaceRoot(null);
    }
    setChatState('idle');
    setRunStatus('idle');
    textareaRef.current?.focus();
  }, [sessionId, transcript, workspaceMode]);

  const resumeHistoricalSession = useCallback(
    async (session: SessionLogEntry) => {
      if (!session.sdkSessionId) {
        throw new Error('该历史会话没有可恢复的 Claude 原生会话 ID');
      }

      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      if (sessionId) {
        if (transcript.length > 0) {
          await persistTranscriptSnapshot(sessionId, transcript);
          await persistInsightsSnapshot(sessionId, deriveRunInsights(transcript));
        }
        await window.coase.chat.cancel(sessionId);
      }

      const history = await window.coase.sessions.transcript(session.sessionId);
      setInput('');
      setRunId(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
      setSdkSessionId(session.sdkSessionId);
      setTranscript(finalizeHistoricalTranscript(history as TranscriptEntry[]));
      setAttachments([]);
      setSelectedCommands([]);
      setSessionId(null);
      setContextUsage(null);
      const historicalWorkspaceRoot =
        session.workspaceRoot ??
        (await window.coase.workspaces.getRoot(session.sessionId));
      setWorkspaceRoot(historicalWorkspaceRoot);
      setWorkspaceMode(historicalWorkspaceRoot ? 'custom' : 'auto');
      setChatState('idle');
      setRunStatus('awaiting_user_guidance');
      setSummaryRefreshKey((key) => key + 1);

      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    [sessionId, transcript],
  );

  const openHistoricalSession = useCallback(
    async (session: SessionLogEntry) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      const activeSessionId = sessionIdRef.current;
      const currentTranscript = transcriptRef.current;

      if (activeSessionId) {
        if (currentTranscript.length > 0) {
          await persistTranscriptSnapshot(activeSessionId, currentTranscript);
          await persistInsightsSnapshot(activeSessionId, deriveRunInsights(currentTranscript));
        }
        await window.coase.chat.cancel(activeSessionId);
      }

      const history = await window.coase.sessions.transcript(session.sessionId);
      setInput('');
      setRunId(null);
      setSdkSessionId(session.sdkSessionId ?? null);
      setTranscript(finalizeHistoricalTranscript(history as TranscriptEntry[]));
      setAttachments([]);
      setSelectedCommands([]);
      setSessionId(null);
      setContextUsage(null);
      const historicalWorkspaceRoot =
        session.workspaceRoot ??
        (await window.coase.workspaces.getRoot(session.sessionId));
      setWorkspaceRoot(historicalWorkspaceRoot);
      setWorkspaceMode(historicalWorkspaceRoot ? 'custom' : 'auto');
      setChatState('idle');
      setRunStatus('idle');
      setSummaryRefreshKey((key) => key + 1);
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  const latestProviderEntry = findLatestProvider(transcript);
  const latestTurnEntry = findLatestTurn(transcript);

  const latestProvider = latestProviderEntry
    ? {
        label:
          latestProviderEntry.providerLabel ??
          (latestProviderEntry.text.match(/^使用\s+(.+?)\s+·/) ?? [])[1] ??
          '未命名',
        model: latestProviderEntry.model,
        baseURL: latestProviderEntry.baseURL,
      }
    : null;

  const latestTurnMetrics = latestTurnEntry
    ? {
        ok: latestTurnEntry.ok,
        turns: latestTurnEntry.turns,
        durationMs: latestTurnEntry.durationMs,
        costUsd: latestTurnEntry.costUsd,
      }
    : null;

  const inferredStage = inferStage(transcript);
  const insights = useMemo(() => deriveRunInsights(transcript), [transcript]);

  const totalTokens = useMemo(
    () =>
      transcript.reduce(
        (sum, entry) => sum + (entry.kind === 'turn_result' ? entry.totalTokens ?? 0 : 0),
        0,
      ),
    [transcript],
  );

  const guidanceHistory = useMemo(
    () =>
      transcript
        .filter(
          (entry): entry is Extract<TranscriptEntry, { kind: 'guidance' }> =>
            entry.kind === 'guidance',
        )
        .map((entry, index) => ({
          id: `${entry.ts}-${index}`,
          ts: entry.ts,
          text: entry.text,
        })),
    [transcript],
  );

  const addAttachments = useCallback((kind: AttachmentKind, paths: string[]) => {
    if (paths.length === 0) return;
    setAttachments((prev) => {
      const known = new Set(prev.map((attachment) => `${attachment.kind}:${attachment.path}`));
      const next = [...prev];
      for (const path of paths) {
        const key = `${kind}:${path}`;
        if (known.has(key)) continue;
        next.push({
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${next.length}`,
          kind,
          path,
          name: getPathName(path),
        });
        known.add(key);
      }
      return next;
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const addSelectedCommand = useCallback((command: SelectedSlashCommand) => {
    setSelectedCommands((prev) => {
      if (prev.some((entry) => entry.id === command.id)) return prev;
      return [...prev, command];
    });
  }, []);

  const removeSelectedCommand = useCallback((id: string) => {
    setSelectedCommands((prev) => prev.filter((command) => command.id !== id));
  }, []);

  const clearSelectedCommands = useCallback(() => {
    setSelectedCommands([]);
  }, []);

  const placeholder =
    runStatus === 'awaiting_user_guidance'
      ? '输入你的纠偏建议，Enter 继续当前研究'
      : runStatus === 'completed' && runId
        ? '可继续补充修改意见，Enter 让 Coase 在当前结果上继续迭代'
        : chatState === 'idle'
          ? '输入研究主题 / 问题开始新研究，Enter 发送，Shift+Enter 换行'
          : chatState === 'waiting'
            ? '当前回合已结束，可继续补充约束或问题'
            : 'agent 正在自动推进研究，可通过右侧暂停按钮打断';

  return {
    runId,
    runStatus,
    sessionId,
    workspaceRoot,
    workspaceMode,
    chatState,
    transcript,
    input,
    latestProvider,
    latestTurnMetrics,
    totalTokens,
    contextUsage,
    inferredStage,
    currentMilestone: insights.currentMilestone,
    artifactCount: insights.artifacts.length,
    milestones: insights.milestones,
    artifacts: insights.artifacts,
    attachments,
    selectedCommands,
    guidanceHistory,
    summaryRefreshKey,
    setInput,
    addAttachments,
    removeAttachment,
    addSelectedCommand,
    removeSelectedCommand,
    clearSelectedCommands,
    chooseWorkspaceRoot,
    resetWorkspaceRoot,
    onSubmit,
    onCancel,
    onInterrupt,
    onNewSession,
    openHistoricalSession,
    resumeHistoricalSession,
    onKeyDown,
    scrollRef,
    textareaRef,
    placeholder,
  };
}

function withAttachmentSummary(text: string, attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return text;
  const summary = attachments
    .map((attachment) => `${attachmentLabel(attachment.kind)}：${attachment.name}`)
    .join('；');
  return `${text}\n\n附加资料：${summary}`;
}

function getPathName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function attachmentLabel(kind: AttachmentKind): string {
  switch (kind) {
    case 'dataset_folder':
      return '数据集文件夹';
    case 'data_file':
      return '数据文件';
    case 'paper_file':
      return '参考论文';
    default:
      return '附加文件';
  }
}

function findLastAssistantByMessageId(
  transcript: TranscriptEntry[],
  messageId: string,
): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'assistant' && entry.messageId === messageId) return i;
  }
  return -1;
}

function findLastToolUseById(transcript: TranscriptEntry[], toolUseId: string): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'tool_use' && entry.toolUseId === toolUseId) return i;
  }
  return -1;
}

function findLastSubagentByTask(transcript: TranscriptEntry[], taskId: string): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'subagent' && entry.taskId === taskId) return i;
  }
  return -1;
}

/**
 * Sanitize transcript entries loaded from disk so replay doesn't animate
 * state that belongs to a live run: live tool timers must stop, and any
 * in-flight assistant streaming flag must drop back to `false`.
 */
function finalizeHistoricalTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.map((entry) => {
    if (entry.kind === 'tool_use' && entry.status === 'running') {
      return { ...entry, status: 'done' };
    }
    if (entry.kind === 'assistant' && entry.streaming) {
      return { ...entry, streaming: false };
    }
    return entry;
  });
}

function findLastThinkingByMessageId(
  transcript: TranscriptEntry[],
  messageId: string,
): number {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'thinking' && entry.messageId === messageId) return i;
  }
  return -1;
}

function findLatestProvider(transcript: TranscriptEntry[]) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'provider') return entry;
  }
  return null;
}

function findLatestTurn(transcript: TranscriptEntry[]) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (entry.kind === 'turn_result') return entry;
  }
  return null;
}

function inferStage(transcript: TranscriptEntry[]): InferredStage {
  const rules: { stage: InferredStage; keywords: string[] }[] = [
    { stage: 'reviewer', keywords: ['reviewer', '审校'] },
    { stage: 'writer', keywords: ['writer', '写作'] },
    { stage: 'analyst', keywords: ['analyst', '分析'] },
    { stage: 'datafetcher', keywords: ['datafetcher', '取数'] },
    { stage: 'planner', keywords: ['planner', '规划'] },
  ];

  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    const haystack =
      entry.kind === 'tool_use'
        ? entry.name.toLowerCase()
        : entry.kind === 'assistant' || entry.kind === 'guidance'
          ? entry.text.toLowerCase()
          : '';
    if (!haystack) continue;
    for (const rule of rules) {
      if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
        return rule.stage;
      }
    }
  }

  return 'idle';
}

async function persistTranscriptSnapshot(
  sessionId: string,
  transcript: TranscriptEntry[],
): Promise<void> {
  try {
    await window.coase.sessions.persistTranscript(
      sessionId,
      transcript as TranscriptEntryPersisted[],
    );
  } catch (error) {
    console.warn('failed to persist transcript', { sessionId, error });
  }
}

function parseSubagentStatusMessage(text: string, ts: number): TranscriptEntry | null {
  const mappings: Array<{
    prefix: string;
    phase: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
  }> = [
    { prefix: '子代理开始：', phase: 'started' },
    { prefix: '子代理进度：', phase: 'progress' },
    { prefix: '子代理完成：', phase: 'completed' },
    { prefix: '子代理失败：', phase: 'failed' },
    { prefix: '子代理停止：', phase: 'stopped' },
  ];

  for (const mapping of mappings) {
    if (text.startsWith(mapping.prefix)) {
      return {
        kind: 'subagent',
        ts,
        phase: mapping.phase,
        text: text.slice(mapping.prefix.length).trim() || mapping.prefix.replace('：', ''),
      };
    }
  }

  return null;
}

async function persistInsightsSnapshot(
  sessionId: string,
  insights: ReturnType<typeof deriveRunInsights>,
): Promise<void> {
  try {
    await window.coase.sessions.persistInsights(sessionId, insights as RunInsightsPersisted);
  } catch (error) {
    console.warn('failed to persist insights', { sessionId, error });
  }
}
