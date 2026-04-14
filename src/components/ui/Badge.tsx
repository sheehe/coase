import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'emerald' | 'indigo' | 'rose' | 'amber';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface text-fg-muted',
  emerald: 'border-border bg-surface text-fg',
  indigo: 'border-border bg-surface text-fg',
  rose: 'border-danger/30 bg-surface text-danger',
  amber: 'border-border bg-surface text-fg',
};

export default function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
