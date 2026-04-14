import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div {...rest} className={`rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...rest }: CardProps) {
  return (
    <div {...rest} className={`border-b border-border px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...rest }: CardProps) {
  return (
    <div {...rest} className={`p-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`flex items-center justify-end gap-2 border-t border-border px-5 py-3 ${className}`}
    >
      {children}
    </div>
  );
}
