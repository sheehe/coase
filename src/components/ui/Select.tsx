import type { SelectHTMLAttributes } from 'react';

// 原生 <select>，Tailwind 样式化。Phase 3 换成 Radix Select 时 API 可兼容。

export default function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        'w-full appearance-none rounded-xl border border-border bg-surface px-3.5 py-2.5 pr-9 text-sm text-fg',
        'focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:text-fg-subtle',
        'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2020%2020%27%20fill%3D%27%23737373%27%3E%3Cpath%20fill-rule%3D%27evenodd%27%20d%3D%27M5.23%207.21a.75.75%200%20011.06.02L10%2011.06l3.71-3.83a.75.75%200%20111.08%201.04l-4.25%204.39a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%27%20clip-rule%3D%27evenodd%27%2F%3E%3C%2Fsvg%3E")] bg-[length:1.1rem] bg-[right_0.7rem_center] bg-no-repeat',
        className,
      ].join(' ')}
    >
      {children}
    </select>
  );
}
