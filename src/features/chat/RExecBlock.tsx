// R 执行块：展示 r_exec 工具即将运行的 R 代码。
import { useMemo } from 'react';

import { Copy, Terminal } from '../../components/Icons';

export default function RExecBlock({ input }: { input: unknown }) {
  const code = useMemo(() => extractCode(input), [input]);

  return (
    <div className="max-w-full">
      <div className="flex items-center gap-2 rounded-t-xl bg-black/[0.04] px-3 py-1.5 text-[11px] font-mono text-fg-muted dark:bg-white/[0.04]">
        <Terminal size={12} />
        <span>r_exec</span>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(code)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
        >
          <Copy size={12} />
          <span>复制</span>
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-xl border border-border border-t-0 bg-surface p-3 text-[12px] leading-[1.55] text-fg">
        {code}
      </pre>
    </div>
  );
}

function extractCode(input: unknown): string {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return JSON.stringify(input, null, 2) ?? '';

  const record = input as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;

  for (const value of Object.values(record)) {
    if (typeof value === 'string') return value;
  }

  return JSON.stringify(input, null, 2) ?? '';
}
