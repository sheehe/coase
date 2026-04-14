import { useEffect, useRef, type ReactNode } from 'react';

/**
 * 原生 <dialog> 包装。
 */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`w-full bg-transparent p-0 backdrop:bg-black/24 backdrop:backdrop-blur-sm dark:backdrop:bg-black/56 ${widthClass}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-sm"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="text-lg leading-none text-fg-subtle transition hover:text-fg"
          >
            ×
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
