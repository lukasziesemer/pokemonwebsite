'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import { useBadgeProgress } from './useBadgeProgress';

type BadgeProgressStyle = CSSProperties & {
  '--badge-track-inset': string;
  '--badge-progress-width': string;
};

export default function BadgeProgressBand({ data }: { data: DashboardData }) {
  const {
    canEdit,
    earned,
    error,
    getBadgeActionLabel,
    levelCaps,
    savingBadge,
    total,
    updateBadgeProgress,
  } = useBadgeProgress(data);
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
            const actionLabel = getBadgeActionLabel(badge);
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
