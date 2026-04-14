import type { ReactNode } from 'react';

/**
 * 表单字段的 label + hint + error 包装。
 * Phase 3 用 shadcn/ui + react-hook-form 重写时可以无痛替换。
 */
export default function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-fg-muted">{label}</label>
      {children}
      {hint && !error && <span className="text-[11px] text-fg-subtle">{hint}</span>}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
