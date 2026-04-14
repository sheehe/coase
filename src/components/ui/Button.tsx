import type { ButtonHTMLAttributes, ReactNode } from 'react';

// 自己手搓的最小 Button。Phase 3 会用 shadcn/ui 替换，API 尽量接近 shadcn 以便无痛换。

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-92 disabled:bg-border disabled:text-fg-subtle',
  secondary:
    'border border-border bg-surface text-fg hover:border-border-strong hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:text-fg-subtle disabled:border-border',
  ghost:
    'border border-transparent bg-transparent text-fg-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04] disabled:text-fg-subtle',
  destructive:
    'border border-danger/30 bg-surface text-danger hover:bg-danger/5 disabled:border-border disabled:text-fg-subtle',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'rounded-xl px-3 py-1.5 text-xs',
  md: 'rounded-xl px-4 py-2.5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={[
        'font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
