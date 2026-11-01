'use client';

import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import { getLevelCapsForGame } from '@/lib/badge-data';
import { useAuth } from '@/lib/contexts/AuthContext';

interface BadgeUpdateResponse {
  data?: {
    badgesEarned?: number;
  };
}

export function useBadgeProgress(data: DashboardData) {
  const { isAdmin } = useAuth();
  const runId = data.run?.id;
  const serverEarned = data.run?.badgesEarned ?? 0;
  const [earned, setEarned] = useState(serverEarned);
  const [synced, setSynced] = useState({ runId, serverEarned });
  const [savingBadge, setSavingBadge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Neue Dashboard-Daten ersetzen den lokalen Stand.
  if (synced.runId !== runId || synced.serverEarned !== serverEarned) {
    setSynced({ runId, serverEarned });
    setEarned(serverEarned);
  }

  const total = data.badges.length;
  const levelCaps = data.run?.gameVersionKey
    ? getLevelCapsForGame(data.run.gameVersionKey)
    : null;
  const canEdit = Boolean(
    isAdmin
      && data.run
      && (data.run.status === 'active' || data.run.status === 'paused')
      && total > 0,
  );

  const updateBadgeProgress = async (position: number) => {
    if (!canEdit || !data.run || savingBadge !== null) return;

    const previousCount = earned;
    const nextCount = position <= earned ? position - 1 : position;
    setEarned(nextCount);
    setSavingBadge(position);
    setError(null);

    try {
      const response = await fetch('/api/runs/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set',
          badgesEarned: nextCount,
          runId: data.run.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Der Ordenfortschritt konnte nicht gespeichert werden.');
      }

      const result = await response.json() as BadgeUpdateResponse;
      setEarned(result.data?.badgesEarned ?? nextCount);
    } catch (updateError) {
      setEarned(previousCount);
      setError(updateError instanceof Error ? updateError.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSavingBadge(null);
    }
  };

  const getBadgeActionLabel = (badge: DashboardData['badges'][number]) => (
    badge.position <= earned
      ? `${badge.name} abwählen. Der Fortschritt wird auf ${badge.position - 1} von ${total} gesetzt.`
      : `${badge.name} auswählen. Der Fortschritt wird auf ${badge.position} von ${total} gesetzt.`
  );

  return {
    canEdit,
    earned,
    error,
    getBadgeActionLabel,
    levelCaps,
    savingBadge,
    total,
    updateBadgeProgress,
  };
}
