'use client';

import { Barlow_Condensed } from 'next/font/google';
import { useEffect, useMemo, useState } from 'react';
import type { DashboardData } from '@/app/dashboard-data';
import { useGameEvents } from '@/lib/contexts/EventContext';
import type { GameEvent } from '@/lib/event-store';
import BalanceBand from './BalanceBand';
import { CoverageLegend } from './CoverageGrid';
import RunBanner from './RunBanner';
import TeamPanel from './TeamPanel';
import { getSpotlightForEvent, TEAM_SLOT_COUNT } from './dashboard-view';
import styles from './Dashboard.module.css';

const displayFont = Barlow_Condensed({
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dashboard-display',
});

const SPOTLIGHT_MS = 6_000;
const TOUR_INTERVAL_MS = 7_000;

function useSpotlight(currentEvent: GameEvent | null, players: DashboardData['players']) {
  // Startet leer, damit auch ein beim Öffnen schon laufendes Ereignis zählt.
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const [expiredId, setExpiredId] = useState<string | null>(null);
  if (currentEvent && currentEvent !== lastEvent) setLastEvent(currentEvent);

  useEffect(() => {
    if (currentEvent || !lastEvent) return;

    const timer = window.setTimeout(() => setExpiredId(lastEvent.id), SPOTLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [currentEvent, lastEvent]);

  if (currentEvent || !lastEvent || expiredId === lastEvent.id) return null;
  return getSpotlightForEvent(lastEvent, players);
}

/** Lauflicht: zeigt reihum, welche Pokémon über einen Teamplatz aneinander gebunden sind. */
function useSlotTour(slots: readonly number[], paused: boolean) {
  const [step, setStep] = useState<number | null>(null);
  const count = slots.length;

  useEffect(() => {
    if (paused || count === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(
      () => setStep(previous => ((previous ?? -1) + 1) % count),
      TOUR_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [count, paused]);

  return paused || step === null || count === 0 ? null : slots[step % count];
}

export default function DashboardBoard({ data }: { data: DashboardData }) {
  const { currentEvent } = useGameEvents();

  // Unter dem Ereignis-Overlay sähe niemand, was sich ändert: Die Tafel wartet, bis es weg ist.
  const [shown, setShown] = useState(data);
  if (!currentEvent && shown !== data) setShown(data);

  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const spotlight = useSpotlight(currentEvent, shown.players);
  const occupiedSlots = useMemo(
    () => Array.from({ length: TEAM_SLOT_COUNT }, (_, index) => index + 1)
      .filter(slot => shown.players.some(player => player.team.some(pokemon => pokemon.teamSlot === slot))),
    [shown.players],
  );
  const tourSlot = useSlotTour(occupiedSlots, hoverSlot !== null || spotlight !== null || currentEvent !== null);

  return (
    <div className={`${styles.board} ${displayFont.variable}`}>
      <RunBanner data={shown} highlighted={spotlight?.kind === 'badges'} />

      {shown.players.length > 0 ? (
        <section
          className={styles.wall}
          aria-label="Aktuelle Teams"
          data-spotlight={spotlight?.kind === 'player' ? 'true' : undefined}
        >
          {shown.players.map((player, index) => (
            <TeamPanel
              key={player.id}
              player={player}
              index={index}
              lit={spotlight?.kind === 'player' && spotlight.playerId === player.id ? spotlight.tone : null}
              linkedSlot={hoverSlot}
              tourSlot={tourSlot}
              flashSlot={spotlight?.kind === 'slot' ? spotlight.teamSlot : null}
              onSlotHover={setHoverSlot}
            />
          ))}
        </section>
      ) : (
        <p className={styles.emptyWall}>Noch keine Spieler angelegt.</p>
      )}

      <CoverageLegend />

      <BalanceBand
        totals={shown.totals}
        playerTotals={shown.playerTotals}
        gameName={shown.run?.gameName ?? null}
        highlighted={spotlight?.kind === 'balance'}
      />
    </div>
  );
}
