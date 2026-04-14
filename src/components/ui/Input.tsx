import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const BASE =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:text-fg-subtle';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${BASE} font-sans ${className}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`${BASE} resize-none font-sans ${className}`} />;
}
