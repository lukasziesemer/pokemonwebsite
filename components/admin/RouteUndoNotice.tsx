'use client';

import { useState } from 'react';
import { mutateEncounterLink } from '@/lib/encounter-link-admin';
import type { RouteStatusChange } from './route-link-ui';

interface RouteUndoNoticeProps {
  change: RouteStatusChange;
  onUndone: () => void | Promise<void>;
  onClose: () => void;
}

/** Holt eine Route nach einem Fehlklick samt Teamplatz zurück. Der Platz lebt nur in dieser Meldung. */
export default function RouteUndoNotice({ change, onUndone, onClose }: RouteUndoNoticeProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = change.status === 'knockout' ? 'K.O.' : 'als nicht gefangen markiert';

  const handleUndo = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutateEncounterLink(
        change.routeId,
        change.teamSlot === null
          ? { action: 'reactivate' }
          : { action: 'reactivate', teamSlot: change.teamSlot },
      );
      await onUndone();
      onClose();
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : 'Rückgängig machen fehlgeschlagen');
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl border border-[var(--border-strong)] bg-[var(--card-bg-elevated)] p-3 text-[var(--foreground)] shadow-lg md:bottom-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-bold">
          {change.routeName} ist {status}
          {change.teamSlot !== null ? ` und hat Platz ${change.teamSlot} verloren.` : '.'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleUndo()} disabled={busy} className="app-action-primary disabled:opacity-50">
            {busy ? 'Wird zurückgesetzt…' : 'Rückgängig'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="app-action disabled:opacity-50">
            Schließen
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
