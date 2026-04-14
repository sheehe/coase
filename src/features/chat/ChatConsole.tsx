import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatEvent, Unsubscribe } from '../../../shared/ipc';
import ChatComposer from './ChatComposer';
import EmptyHero from './EmptyHero';
import TranscriptMessage, { type TranscriptEntry } from './TranscriptMessage';

type ChatState = 'idle' | 'running' | 'waiting';

export default function ChatConsole() {
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
          return [...prev, { kind: 'turn_result', ts, ok: ev.ok, detail: parts.join(' · ') }];
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {transcript.length === 0 && chatState === 'idle' ? (
          <EmptyHero onPick={setInput} textareaRef={textareaRef} />
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-6 py-8">
              {transcript.map((entry, i) => (
                <TranscriptMessage key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        onCancel={() => void onCancel()}
        onKeyDown={onKeyDown}
        state={chatState}
        placeholder={placeholder}
        sessionId={sessionId}
        onNewSession={() => void onNewSession()}
        textareaRef={textareaRef}
      />
      <span className="hidden">{summaryRefreshKey}</span>
    </div>
  );
}
