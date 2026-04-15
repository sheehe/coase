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
      className="m-auto border-0 bg-transparent p-0 text-left backdrop:bg-black/10 dark:backdrop:bg-black/16"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`mx-auto w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-sm ${widthClass}`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[26px] leading-none text-fg-subtle transition hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.04]"
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
