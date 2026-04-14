// 单条 transcript 消息：按消息类型切换视觉表达。
import { useState } from 'react';

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Wrench,
} from '../../components/Icons';
import RExecBlock from './RExecBlock';

export type TranscriptEntry =
  | { kind: 'status'; ts: number; text: string }
  | {
      kind: 'provider';
      ts: number;
      text: string;
      providerId?: string;
      providerLabel?: string;
      model: string;
      baseURL?: string;
    }
  | { kind: 'user'; ts: number; text: string }
  | { kind: 'assistant'; ts: number; text: string }
  | { kind: 'tool_use'; ts: number; name: string; input: unknown }
  | { kind: 'tool_result'; ts: number; text: string; isError: boolean }
  | { kind: 'error'; ts: number; text: string }
  | {
      kind: 'turn_result';
      ts: number;
      ok: boolean;
      detail: string;
      turns?: number;
      durationMs?: number;
      costUsd?: number;
    };

export default function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false });
  const [expanded, setExpanded] = useState(false);

  switch (entry.kind) {
    case 'status':
      return <DividerLabel text={entry.text} />;
    case 'provider':
      return <DividerLabel text={entry.text} />;
    case 'turn_result':
      return (
        <DividerLabel
          text={`turn ${entry.ok ? 'ok' : 'failed'} · ${entry.detail}`}
          danger={!entry.ok}
        />
      );
    case 'user':
      return (
        <div className="flex self-end">
          <div className="max-w-[80%]">
            <div className="mb-1 text-right text-[11px] text-fg-subtle">你 · {time}</div>
            <div className="rounded-2xl rounded-tr-md border border-border bg-surface px-4 py-3 text-[14px] whitespace-pre-wrap text-fg">
              {entry.text}
            </div>
          </div>
        </div>
      );
    case 'assistant':
      return (
        <div className="flex gap-3">
          <div className="mt-1 h-6 w-6 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] text-fg-subtle">Coase · {time}</div>
            <div className="whitespace-pre-wrap text-[14px] leading-[1.65] text-fg">
              {entry.text}
            </div>
          </div>
        </div>
      );
    case 'tool_use':
      if (entry.name === 'r_exec') {
        return (
          <div className="-mt-3 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] text-fg-subtle transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]">
              <Wrench size={11} className="text-fg-subtle" />
              <span>{entry.name}</span>
            </div>
            <RExecBlock input={entry.input} />
          </div>
        );
      }
      return (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] text-fg-subtle transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          >
            <Wrench size={11} className="text-fg-subtle" />
            <span>{entry.name}</span>
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {expanded && (
            <pre className="mt-1 overflow-x-auto rounded-2xl border border-border/60 bg-surface p-2 text-[10.5px] whitespace-pre-wrap text-fg-muted">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
          )}
        </div>
      );
    case 'tool_result': {
      const label = entry.isError ? '工具失败' : `工具结果 · ${entry.text.length} 字`;
      return (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] transition',
              entry.isError
                ? 'text-danger/80 hover:bg-danger/5'
                : 'text-fg-subtle hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
            ].join(' ')}
          >
            {entry.isError ? <AlertCircle size={10} /> : <Check size={10} />}
            <span>{label}</span>
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {expanded && (
            <pre
              className={[
                'mt-1 overflow-x-auto rounded-2xl border bg-surface p-2 text-[10.5px] whitespace-pre-wrap',
                entry.isError ? 'border-danger/30 text-danger' : 'border-border/60 text-fg-muted',
              ].join(' ')}
            >
              {entry.text}
            </pre>
          )}
        </div>
      );
    }
    case 'error':
      return (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-[13px] text-danger">{entry.text}</div>
        </div>
      );
  }
}

function DividerLabel({ text, danger = false }: { text: string; danger?: boolean }) {
  const cls = danger ? 'text-danger' : 'text-fg-subtle';
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 border-t border-dashed border-border" />
      <div className={`text-[11px] font-mono ${cls}`}>{text}</div>
      <div className="h-px flex-1 border-t border-dashed border-border" />
    </div>
  );
}
