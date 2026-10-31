'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutateEncounterLink } from '@/lib/encounter-link-admin';

interface AssignRouteButtonProps {
  routeId: number;
  routeName: string;
  teamSlot: number;
}

export default function AssignRouteButton({ routeId, routeName, teamSlot }: AssignRouteButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutateEncounterLink(routeId, { action: 'set-team-slot', teamSlot });
      router.refresh();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Teamplatz konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleAssign()}
        disabled={busy}
        aria-label={`${routeName} auf Platz ${teamSlot} ins Team`}
        className="app-action-primary disabled:opacity-50"
      >
        {busy ? 'Speichert…' : 'Ins Team'}
      </button>
      {error ? <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </>
  );
}
