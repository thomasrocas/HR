import React from 'react';

export interface UserModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}

export default function UserModal({
  open,
  title,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-lg',
}: UserModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClassName} bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)]`}
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-xl leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            &times;
          </button>
        </header>
        <div className="px-6 py-5 space-y-4 text-sm">{children}</div>
        {footer && (
          <footer className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-alt)]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
