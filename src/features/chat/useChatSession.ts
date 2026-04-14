// 会话状态 Hook：原封搬运 ChatConsole 的状态机与回调，并补充派生状态。
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatEvent, Unsubscribe } from '../../../shared/ipc';
import type { TranscriptEntry } from './TranscriptMessage';

type ChatState = 'idle' | 'running' | 'waiting';
type InferredStage = 'planner' | 'datafetcher' | 'analyst' | 'writer' | 'reviewer' | 'idle';

export interface ChatSessionValue {
  sessionId: string | null;
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
  inferredStage: InferredStage;
  summaryRefreshKey: number;
  setInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => Promise<void>;
  onNewSession: () => Promise<void>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}

export function useChatSession(): ChatSessionValue {
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleEvent = useCallback((ev: ChatEvent) => {
    const ts = Date.now();
    setTranscript((prev) => {
      switch (ev.type) {
        case 'session_started':
          return [...prev, { kind: 'status', ts, text: '会话开始' }];
        case 'session_finished':
          return [
            ...prev,
            {
              kind: 'status',
              ts,
              text:
                ev.reason === 'user_cancel'
                  ? '会话已取消'
                  : ev.reason === 'error'
                    ? '会话因错误结束'
                    : '会话结束',
            },
          ];
        case 'provider': {
          const label = ev.providerLabel ?? (ev.source === 'env' ? 'env fallback' : '未命名');
          return [
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
        }
        case 'user_message_accepted':
          return [...prev, { kind: 'user', ts, text: ev.text }];
        case 'assistant_text':
          return [...prev, { kind: 'assistant', ts, text: ev.text }];
        case 'tool_use':
          return [...prev, { kind: 'tool_use', ts, name: ev.name, input: ev.input }];
        case 'tool_result':
          return [...prev, { kind: 'tool_result', ts, text: ev.text, isError: ev.isError }];
        case 'error':
          return [...prev, { kind: 'error', ts, text: ev.message }];
        case 'turn_result': {
          const parts: string[] = [];
          if (typeof ev.num_turns === 'number') parts.push(`turns=${ev.num_turns}`);
          if (typeof ev.duration_ms === 'number')
            parts.push(`duration=${(ev.duration_ms / 1000).toFixed(1)}s`);
          if (typeof ev.cost_usd === 'number') parts.push(`cost=$${ev.cost_usd.toFixed(4)}`);
          if (!ev.ok && ev.subtype) parts.push(`subtype=${ev.subtype}`);
          if (!ev.ok && ev.errors?.length) parts.push(ev.errors.join('; '));
          return [
            ...prev,
            {
              kind: 'turn_result',
              ts,
              ok: ev.ok,
              detail: parts.join(' · '),
              turns: ev.num_turns,
              durationMs: ev.duration_ms,
              costUsd: ev.cost_usd,
            },
          ];
        }
        default:
          return prev;
      }
    });

    if (ev.type === 'turn_result') {
      setChatState('waiting');
    } else if (ev.type === 'session_finished') {
      setChatState('idle');
      setSessionId(null);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setSummaryRefreshKey((k) => k + 1);
    }
  }, []);

  const startSession = useCallback(
    async (firstMessage: string) => {
      setTranscript([]);
      setChatState('running');
      try {
        const outcome = await window.coase.chat.start(firstMessage);
        setSessionId(outcome.sessionId);
        unsubscribeRef.current = window.coase.chat.onEvent(outcome.sessionId, handleEvent);
      } catch (err) {
        setChatState('idle');
        setSessionId(null);
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
    [handleEvent],
  );

  const sendFollowup = useCallback(async (sid: string, text: string) => {
    setChatState('running');
    try {
      await window.coase.chat.send(sid, text);
    } catch (err) {
      setChatState('waiting');
      setTranscript((prev) => [
        ...prev,
        {
          kind: 'error',
          ts: Date.now(),
          text: err instanceof Error ? err.message : String(err),
        },
      ]);
    }
  }, []);

  const onSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || chatState === 'running') return;

    setInput('');
    if (chatState === 'idle' || !sessionId) {
      void startSession(text);
    } else {
      void sendFollowup(sessionId, text);
    }
  }, [input, chatState, sessionId, startSession, sendFollowup]);

  const onCancel = useCallback(async () => {
    if (!sessionId) return;
    await window.coase.chat.cancel(sessionId);
  }, [sessionId]);

  const onNewSession = useCallback(async () => {
    if (sessionId) {
      await window.coase.chat.cancel(sessionId);
    }
    setTranscript([]);
    setSessionId(null);
    setChatState('idle');
    textareaRef.current?.focus();
  }, [sessionId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  const placeholder =
    chatState === 'idle'
      ? '输入研究主题 / 问题开始新会话，Enter 发送，Shift+Enter 换行'
      : chatState === 'waiting'
        ? '继续对话，agent 已经在等你下一步指示'
        : 'agent 正在处理上一条消息，请稍候';

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

  return {
    sessionId,
    chatState,
    transcript,
    input,
    latestProvider,
    latestTurnMetrics,
    inferredStage,
    summaryRefreshKey,
    setInput,
    onSubmit,
    onCancel,
    onNewSession,
    onKeyDown,
    scrollRef,
    textareaRef,
    placeholder,
  };
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
        : entry.kind === 'assistant'
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
