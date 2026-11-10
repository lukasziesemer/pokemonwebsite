'use client';

import Image from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import RollingNumber from './RollingNumber';
import { formatDuration, getDurationClock, statusTone } from './dashboard-view';
import { useBadgeProgress } from './useBadgeProgress';
import styles from './Dashboard.module.css';

function LiveClock({ durationMs, running }: { durationMs: number; running: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!running) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const total = durationMs + elapsedMs;
  const { days, clock } = getDurationClock(total);

  return (
    <span className={styles.clock}>
      <span className="sr-only">Laufzeit {formatDuration(total)}</span>
      <span aria-hidden="true">
        {days > 0 ? <span className={styles.clockDays}>{days} T</span> : null}
        {clock}
      </span>
    </span>
  );
}

function BadgeRail({ data }: { data: DashboardData }) {
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

  if (total === 0) {
    return <p className={styles.noBadges}>Für dieses Spiel sind keine klassischen Orden hinterlegt.</p>;
  }

  const nextBadge = earned < total ? data.badges[earned] : null;
  const nextCap = nextBadge ? levelCaps?.[earned] ?? null : null;
  const trackInset = 100 / (total * 2);
  const progress = total > 1 && earned > 0
    ? (Math.min(earned - 1, total - 1) / (total - 1)) * (100 - trackInset * 2)
    : 0;
  const railStyle = {
    '--badge-count': total,
    '--track-inset': `${trackInset}%`,
    '--track-progress': `${progress}%`,
  } as CSSProperties;

  return (
    <>
      <div className={styles.cap}>
        {nextBadge ? (
          <>
            <span className={styles.capLabel}>{nextCap !== null ? 'Level-Cap' : 'Nächster Orden'}</span>
            <span className={styles.capValue}>
              <RollingNumber value={nextCap ?? nextBadge.position} />
            </span>
            <span className={styles.capNote}>bis {nextBadge.name}, {nextBadge.leader}</span>
          </>
        ) : (
          <>
            <span className={styles.capLabel}>Orden</span>
            <span className={styles.capValue}>{total}/{total}</span>
            <span className={styles.capNote}>Alle Orden erhalten</span>
          </>
        )}
      </div>

      <section className={styles.rail} aria-labelledby="badge-rail-title">
        <div className={styles.railHead}>
          <h2 id="badge-rail-title">
            Orden <span><RollingNumber value={earned} />/{total}</span>
          </h2>
          <p aria-live="polite">
            {savingBadge !== null ? 'Wird gespeichert …' : canEdit ? 'Orden anklicken zum Setzen' : null}
            {error ? <span className={styles.railError}> {error}</span> : null}
          </p>
        </div>

        <ol className={styles.badges} style={railStyle} aria-label={`${earned} von ${total} Orden erhalten`}>
          {data.badges.map((badge, index) => {
            const isEarned = badge.position <= earned;
            const levelCap = levelCaps?.[index] ?? null;
            const label = `${badge.position}. ${badge.name}, ${badge.leader}${levelCap !== null ? `, Level-Cap ${levelCap}` : ''}`;
            const icon = <Image src={badge.imagePath} alt="" width={48} height={48} />;

            return (
              <li
                key={badge.key}
                className={styles.badge}
                style={{ '--badge-i': index } as CSSProperties}
                data-earned={isEarned ? 'true' : undefined}
                data-next={badge === nextBadge ? 'true' : undefined}
                data-saving={savingBadge === badge.position ? 'true' : undefined}
              >
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.badgeIcon}
                    aria-label={getBadgeActionLabel(badge)}
                    aria-pressed={isEarned}
                    disabled={savingBadge !== null}
                    title={label}
                    onClick={() => updateBadgeProgress(badge.position)}
                  >
                    {icon}
                  </button>
                ) : (
                  <span className={styles.badgeIcon} title={label}>{icon}</span>
                )}
                {levelCap !== null ? <span className={styles.badgeCap} aria-hidden="true">Lv {levelCap}</span> : null}
                <span className="sr-only">{label}: {isEarned ? 'erhalten' : 'noch offen'}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

export default function RunBanner({ data, highlighted }: { data: DashboardData; highlighted: boolean }) {
  const { run } = data;

  return (
    <header className={styles.banner} data-lit={highlighted ? 'true' : undefined}>
      <svg className={styles.bannerBall} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" />
        <path d="M4 50h30M66 50h30" />
        <circle cx="50" cy="50" r="16" />
      </svg>

      <div className={styles.run}>
        {run ? <span className={styles.runNumber} aria-hidden="true">#{run.number}</span> : null}
        <div className={styles.runInfo}>
          <h1>
            {run ? <span className="sr-only">Run {run.number}, </span> : null}
            {run?.gameName ?? 'Kein Run vorhanden'}
          </h1>
          {run ? (
            <p>
              <span className={styles.status} data-tone={statusTone(run.status)}>{run.statusLabel}</span>
              <LiveClock key={run.durationMs} durationMs={run.durationMs} running={run.status === 'active'} />
            </p>
          ) : null}
        </div>
      </div>

      {run ? <BadgeRail data={data} /> : null}
    </header>
  );
}
