'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface EncounterAdminDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  busy?: boolean;
  /** Macht den Dialog zum Formular: Enter bestätigt, der Bestätigen-Button ist type="submit". */
  onSubmit?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Accessible modal used by EncounterActionMenu. */
export default function EncounterAdminDialog({
  isOpen,
  title,
  description,
  onClose,
  children,
  actions,
  busy = false,
  onSubmit,
}: EncounterAdminDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      (
        dialog?.querySelector<HTMLElement>('[data-autofocus]')
        ?? dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      )?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const body = (
    <>
      <div className="space-y-4 px-5 pt-5 sm:px-6">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--border-default)] px-5 py-4 sm:px-6">{actions}</div>
    </>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--brand-navy)]/78 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="max-h-[min(90vh,44rem)] w-full max-w-md overflow-y-auto border border-[var(--border-default)] bg-[var(--card-bg-elevated)] text-[var(--foreground)]"
      >
        <div className="flex items-start justify-between gap-4 bg-[var(--brand-navy)] px-5 py-4 text-white sm:px-6">
          <div>
            <h2 id={titleId} className="font-[var(--font-display)] text-xl font-black uppercase tracking-[-0.025em] text-white">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-white/65">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Dialog schließen"
            className="grid min-h-11 min-w-11 place-items-center text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 6l12 12M18 6 6 18"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </button>
        </div>

        {onSubmit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : body}
      </div>
    </div>,
    document.body,
  );
}
