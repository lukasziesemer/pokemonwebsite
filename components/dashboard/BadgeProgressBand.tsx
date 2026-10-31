'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import { getLevelCapsForGame } from '@/lib/badge-data';
import { useAuth } from '@/lib/contexts/AuthContext';

interface BadgeUpdateResponse {
  data?: {
    badgesEarned?: number;
  };
}

type BadgeProgressStyle = CSSProperties & {
  '--badge-track-inset': string;
  '--badge-progress-width': string;
};

export default function BadgeProgressBand({ data }: { data: DashboardData }) {
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
  const trackInset = total > 0 ? 100 / (total * 2) : 0;
  const trackSpan = 100 - trackInset * 2;
  const progressWidth =
    total > 1 && earned > 0
      ? (Math.min(earned - 1, total - 1) / (total - 1)) * trackSpan
      : 0;
  const progressStyle: BadgeProgressStyle = {
    '--badge-track-inset': `${trackInset}%`,
    '--badge-progress-width': `${progressWidth}%`,
  };
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

  return (
    <section className="dashboard-badge-band app-band app-band--navy" aria-labelledby="badge-progress-title">
      <h2 id="badge-progress-title">
        Ordenfortschritt <span>{earned}/{total || '–'}</span>
      </h2>

      {total > 0 ? (
        <ol
          className="dashboard-badges"
          aria-label={`${earned} von ${total} Orden erhalten`}
          style={progressStyle}
        >
          {data.badges.map((badge, index) => {
            const isEarned = badge.position <= earned;
            const levelCap = levelCaps?.[index] ?? null;
            const actionLabel = isEarned
              ? `${badge.name} abwählen. Der Fortschritt wird auf ${badge.position - 1} von ${total} gesetzt.`
              : `${badge.name} auswählen. Der Fortschritt wird auf ${badge.position} von ${total} gesetzt.`;
            const badgeIcon = (
              <Image src={badge.imagePath} alt="" width={48} height={48} />
            );

            return (
              <li
                key={badge.key}
                className={isEarned ? 'is-earned' : ''}
                data-saving={savingBadge === badge.position ? 'true' : undefined}
              >
                {canEdit ? (
                  <button
                    type="button"
                    className="dashboard-badge-icon dashboard-badge-toggle"
                    aria-label={actionLabel}
                    aria-pressed={isEarned}
                    disabled={savingBadge !== null}
                    onClick={() => updateBadgeProgress(badge.position)}
                    title={actionLabel}
                  >
                    {badgeIcon}
                  </button>
                ) : (
                  <div className="dashboard-badge-icon">{badgeIcon}</div>
                )}
                {levelCap !== null ? (
                  <span className="dashboard-badge-level-cap" aria-hidden="true">
                    LV {levelCap}
                  </span>
                ) : null}
                <span className="sr-only">
                  {badge.position}. {badge.name}, {badge.leader}
                  {levelCap !== null ? `, Level-Cap ${levelCap}` : ''}: {isEarned ? 'erhalten' : 'noch offen'}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dashboard-no-badges">Für dieses Spiel sind keine klassischen Orden hinterlegt.</p>
      )}

      <div className="dashboard-badge-summary" aria-live="polite">
        <strong className="dashboard-badge-result">
          {savingBadge !== null
            ? 'Wird gespeichert …'
            : total > 0 && earned >= total
              ? 'Alle Orden erhalten'
              : `${Math.max(total - earned, 0)} offen`}
        </strong>
        {canEdit ? <small>Admin · Orden anklicken</small> : null}
        {error ? <small className="dashboard-badge-error">{error}</small> : null}
      </div>
    </section>
  );
}
