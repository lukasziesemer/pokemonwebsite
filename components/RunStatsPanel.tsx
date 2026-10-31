'use client';

/**
 * RunStatsPanel - Zeigt aktuelle Run-Info und historische Statistiken
 */

import { useState, useEffect } from 'react';
import BadgeProgressTracker from './BadgeProgressTracker';
import { calculateWinRate } from '@/lib/run-lifecycle';

interface GameVersion {
  key: string;
  name: string;
  generation: number;
}

interface ActiveRun {
  id: number;
  runNumber: number;
  gameVersion: GameVersion | null;
  startedAt: string;
  pausedAt: string | null;
  totalPausedMs: number;
  badgesEarned: number;
}

interface PlayerStats {
  playerName: string;
  totalKnockedOut: number;
  totalNotCaught: number;
  runsLost: number;
}

interface RunStats {
  activeRun: ActiveRun | null;
  totalRuns: number;
  failedRuns: number;
  completedRuns: number;
  aggregatedPlayerStats: PlayerStats[];
}

interface RunStatsPanelProps {
  isAdmin?: boolean;
}

function formatElapsedTime(activeRun: ActiveRun, now: number): string {
  const startTime = new Date(activeRun.startedAt).getTime();
  const totalPausedMs = activeRun.totalPausedMs || 0;

  let elapsedMs: number;

  if (activeRun.pausedAt) {
    // Run ist pausiert - zeige Zeit bis zur Pause
    const pauseTime = new Date(activeRun.pausedAt).getTime();
    elapsedMs = pauseTime - startTime - totalPausedMs;
  } else {
    // Run läuft - zeige aktuelle Zeit minus pausierte Zeit
    elapsedMs = now - startTime - totalPausedMs;
  }

  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export default function RunStatsPanel({ isAdmin = false }: RunStatsPanelProps) {
  const [stats, setStats] = useState<RunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(0);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [badgeLoading, setBadgeLoading] = useState(false);

  const fetchStats = () =>
    fetch('/api/runs/stats')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setStats(data);
          setNow(Date.now());
        }
      })
      .catch((error) => {
        console.error('Error fetching run stats:', error);
      })
      .finally(() => {
        setLoading(false);
      });

  useEffect(() => {
    fetchStats();
  }, []);

  const togglePause = async () => {
    if (pauseLoading) return;

    setPauseLoading(true);
    try {
      const res = await fetch('/api/runs/pause', {
        method: 'POST',
      });

      if (res.ok) {
        // Stats neu laden
        await fetchStats();
      }
    } catch (error) {
      console.error('Error toggling pause:', error);
    } finally {
      setPauseLoading(false);
    }
  };

  const handleBadgeClick = async (newCount: number) => {
    if (badgeLoading) return;
    setBadgeLoading(true);
    try {
      const action = newCount > (stats?.activeRun?.badgesEarned ?? 0)
        ? 'increment'
        : 'decrement';
      const res = await fetch('/api/runs/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch (error) {
      console.error('Error updating badges:', error);
    } finally {
      setBadgeLoading(false);
    }
  };

  const activeRun = stats?.activeRun;
  const elapsedTime = activeRun?.startedAt ? formatElapsedTime(activeRun, now) : '';

  // Timer für vergangene Zeit
  useEffect(() => {
    // Wenn pausiert, nicht weiter aktualisieren
    if (!activeRun?.startedAt || activeRun.pausedAt) {
      return;
    }

    // Jede Sekunde aktualisieren
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, [activeRun]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-[var(--background-tertiary)] rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-[var(--background-tertiary)] rounded w-1/2"></div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const {
    totalRuns,
    failedRuns,
    completedRuns,
    aggregatedPlayerStats,
  } = stats;
  const winRate = calculateWinRate(completedRuns, failedRuns);

  // Kein aktiver Run und keine Historie -> nichts anzeigen
  if (!activeRun && totalRuns === 0) {
    return null;
  }

  return (
    <>
      {/* Header mit Run-Info */}
      <div className="mb-4 flex flex-col gap-3 border-b-2 border-[var(--foreground)] pb-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            {activeRun?.gameVersion && (
              <span className="app-status border-[var(--brand-blue)] text-[var(--brand-blue)]">
                {activeRun.gameVersion.name}
              </span>
            )}
            {activeRun && (
              <span className="text-lg font-black uppercase text-[var(--foreground)]">
                Run #{activeRun.runNumber}
              </span>
            )}
          </div>
          {elapsedTime && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-mono text-[var(--text-secondary)]">
                  {elapsedTime}
                </span>
                {stats.activeRun?.pausedAt && (
                  <span className="app-status border-amber-500 text-amber-600">
                    Pausiert
                  </span>
                )}
              </div>

              {/* Pause/Play Button - nur für Admins */}
              {isAdmin && (
                <button
                  onClick={togglePause}
                  disabled={pauseLoading}
                  className={`app-action min-h-9 px-2 transition-colors ${
                    pauseLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-[var(--brand-blue)]'
                  }`}
                  title={stats.activeRun?.pausedAt ? 'Timer fortsetzen' : 'Timer pausieren'}
                >
                  {stats.activeRun?.pausedAt ? (
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {winRate !== null && (
          <div className="flex flex-wrap items-center gap-2 border-y border-[var(--border-default)] px-3 py-2 text-sm">
            <span className="font-black text-emerald-600 dark:text-emerald-300">
              {completedRuns} {completedRuns === 1 ? 'Sieg' : 'Siege'}
            </span>
            <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
            <span className="font-black text-red-600 dark:text-red-300">
              {failedRuns} {failedRuns === 1 ? 'Niederlage' : 'Niederlagen'}
            </span>
            <span className="app-status font-black text-[var(--foreground)]">
              {winRate}% Siegquote
            </span>
          </div>
        )}
      </div>

      {/* Toggle für Statistiken */}
      {aggregatedPlayerStats.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="app-action flex items-center gap-2 text-sm"
            aria-expanded={expanded}
          >
            <span className="transition-transform duration-300" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span>Übergreifende Statistiken {expanded ? 'ausblenden' : 'anzeigen'}</span>
          </button>

          {/* Statistik-Tabelle */}
          {expanded && (
            <div className="mt-4 overflow-x-auto animate-[slide-in-up_0.3s_ease-out]">
              <table className="app-data-table w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--brand-navy)] text-white">
                    <th className="px-2 py-2 text-left font-black uppercase tracking-widest md:px-3">Spieler</th>
                    <th className="px-1 py-2 text-center font-black uppercase tracking-widest md:px-2">
                      <span title="Pokémon K.O. über alle Runs">K.O.</span>
                    </th>
                    <th className="px-1 py-2 text-center font-black uppercase tracking-widest md:px-2">
                      <span title="Nicht gefangen über alle Runs">N.g.</span>
                    </th>
                    <th className="px-2 py-2 text-center font-black uppercase tracking-widest md:px-3">
                      <span title="Runs gefailed">Gefailed</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedPlayerStats.map((player) => (
                    <tr key={player.playerName} className="border-b border-[var(--border-default)] hover:bg-[var(--background-tertiary)] transition-colors duration-300">
                      <td className="py-2 px-2 md:px-3 font-medium text-[var(--foreground)]">{player.playerName}</td>

                      {/* K.O. */}
                      <td className="py-2 px-1 md:px-2 text-center">
                        <span className={`app-status text-xs ${player.totalKnockedOut > 0 ? 'border-red-500 text-red-600 dark:text-red-300' : 'text-[var(--text-tertiary)]'}`}>
                          {player.totalKnockedOut}
                        </span>
                      </td>

                      {/* Nicht gefangen */}
                      <td className="py-2 px-1 md:px-2 text-center">
                        <span className={`app-status text-xs ${player.totalNotCaught > 0 ? 'border-amber-500 text-amber-600 dark:text-amber-300' : 'text-[var(--text-tertiary)]'}`}>
                          {player.totalNotCaught}
                        </span>
                      </td>

                      {/* Gefailed */}
                      <td className="py-2 px-2 md:px-3 text-center">
                        <span className={`app-status ${player.runsLost > 0 ? 'border-[var(--brand-blue)] font-bold text-[var(--brand-blue)]' : 'text-[var(--text-tertiary)]'}`}>
                          {player.runsLost}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Badge Progress Tracker */}
      {activeRun && (
        <BadgeProgressTracker
          gameVersionKey={activeRun.gameVersion?.key ?? null}
          badgesEarned={activeRun.badgesEarned ?? 0}
          onBadgeClick={isAdmin ? handleBadgeClick : undefined}
        />
      )}
    </>
  );
}
