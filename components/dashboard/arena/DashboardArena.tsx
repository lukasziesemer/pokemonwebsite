'use client';

import Image from 'next/image';
import { Lilita_One, Nunito } from 'next/font/google';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DashboardData, DashboardPlayer } from '@/app/dashboard-data';
import { PokemonDetailsTrigger, usePokemonDetails } from '@/components/pokemon-details';
import { useGameEvents } from '@/lib/contexts/EventContext';
import { getAverageTeamStrength } from '@/lib/team-base-stats';
import { getGermanTypeName } from '@/lib/typeEffectiveness';
import { formatDuration, statusTone } from '../run-format';
import { useBadgeProgress } from '../useBadgeProgress';
import { getArenaShotForEvent, getArenaShotHoldMs, type ArenaShot } from './arena-director';
import { getArenaRosterKey, TEAM_SLOT_COUNT, toArenaSceneData } from './arena-model';
import type { ArenaSceneHandle } from './arena-scene';
import styles from './DashboardArena.module.css';

const displayFont = Lilita_One({ weight: '400', subsets: ['latin'], display: 'swap' });
const bodyFont = Nunito({ weight: ['700', '800'], subsets: ['latin'], display: 'swap' });

const TOTAL_VIEW = -1;

function BadgeCase({ data }: { data: DashboardData }) {
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

  if (total === 0) return null;

  return (
    <section className={`${styles.panel} ${styles.badgeCase}`} aria-label={`${earned} von ${total} Orden erhalten`}>
      <ol>
        {data.badges.map((badge, index) => {
          const isEarned = badge.position <= earned;
          const levelCap = levelCaps?.[index] ?? null;
          const label = `${badge.position}. ${badge.name}, ${badge.leader}${levelCap !== null ? `, Level-Cap ${levelCap}` : ''}`;
          const icon = <Image src={badge.imagePath} alt="" width={32} height={32} />;

          return (
            <li
              key={badge.key}
              className={isEarned ? styles.badgeEarned : undefined}
              data-saving={savingBadge === badge.position ? 'true' : undefined}
            >
              {canEdit ? (
                <button
                  type="button"
                  aria-label={getBadgeActionLabel(badge)}
                  aria-pressed={isEarned}
                  disabled={savingBadge !== null}
                  title={label}
                  onClick={() => updateBadgeProgress(badge.position)}
                >
                  {icon}
                </button>
              ) : (
                <span title={label}>{icon}</span>
              )}
              {levelCap !== null ? <small>{levelCap}</small> : null}
              <span className="sr-only">{label}: {isEarned ? 'erhalten' : 'noch offen'}</span>
            </li>
          );
        })}
      </ol>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function TrainerBox({
  player,
  losses,
  focused,
  onToggle,
}: {
  player: DashboardPlayer;
  losses: number | null;
  focused: boolean;
  onToggle: () => void;
}) {
  const average = getAverageTeamStrength(player.team);
  const slots = Array.from({ length: TEAM_SLOT_COUNT }, (_, index) =>
    player.team.find(pokemon => pokemon.teamSlot === index + 1) ?? null,
  );

  return (
    <article
      className={styles.trainer}
      data-focused={focused ? 'true' : undefined}
      style={{ '--accent': player.color } as CSSProperties}
    >
      <button type="button" className={styles.trainerToggle} aria-expanded={focused} onClick={onToggle}>
        <span className={styles.trainerHead}>
          <span className={styles.trainerName}>
            {player.name}
            <small>Ø {average ?? '–'} BP</small>
          </span>
          <span className={styles.balls} aria-label={`${player.team.length} von ${TEAM_SLOT_COUNT} Teamplätzen belegt`}>
            {slots.map((pokemon, index) => <i key={index} data-free={pokemon ? undefined : 'true'} />)}
          </span>
        </span>
        <span className={styles.trainerStats}>
          <span><strong>{player.stats.knockedOut}</strong> K.O.</span>
          <span><strong>{player.stats.notCaught}</strong> nicht gefangen</span>
          {losses !== null ? <span><strong>{losses}</strong> Runs verloren</span> : null}
        </span>
      </button>

      {focused ? (
        <ol className={styles.roster} aria-label={`Team von ${player.name}`}>
          {player.team.map(pokemon => (
            <li key={pokemon.id}>
              <PokemonDetailsTrigger pokemon={{ ...pokemon, displayName: pokemon.nickname }}>
                <span>{pokemon.nickname ?? pokemon.nameGerman ?? pokemon.name}</span>
                <small>{pokemon.types.map(getGermanTypeName).join(', ')}</small>
              </PokemonDetailsTrigger>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

interface DashboardArenaProps {
  data: DashboardData;
  /** Bisherige Ansicht, falls WebGL fehlt oder der Grafikkontext verloren geht. */
  fallback: ReactNode;
  children: ReactNode;
}

export default function DashboardArena({ data, fallback, children }: DashboardArenaProps) {
  const { openPokemonDetails } = usePokemonDetails();
  const { currentEvent } = useGameEvents();
  const sceneData = useMemo(() => toArenaSceneData(data), [data]);
  const rosterKey = getArenaRosterKey(sceneData.players);
  const [focus, setFocus] = useState(TOTAL_VIEW);
  const [failed, setFailed] = useState(false);
  const [directorShot, setDirectorShot] = useState<ArenaShot | null>(null);
  const [directedEvent, setDirectedEvent] = useState(currentEvent);

  // Die Kamera fliegt schon unter dem Overlay los, wenn es verschwindet, steht sie am Ort des Geschehens.
  if (currentEvent && currentEvent !== directedEvent) {
    setDirectedEvent(currentEvent);
    setDirectorShot(getArenaShotForEvent(currentEvent, data.players));
  }

  // Wer selbst wählt, übernimmt von der Regie.
  const chooseFocus = useCallback((next: number) => {
    setDirectorShot(null);
    setFocus(next);
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ArenaSceneHandle | null>(null);
  const latest = useRef({ data, sceneData, focus, directorShot, openPokemonDetails });

  useEffect(() => {
    latest.current = { data, sceneData, focus, directorShot, openPokemonDetails };
  }, [data, directorShot, focus, openPokemonDetails, sceneData]);

  useEffect(() => {
    const host = stageRef.current;
    const tagHost = tagsRef.current;
    if (!host || !tagHost || failed) return;

    let cancelled = false;
    let scene: ArenaSceneHandle | null = null;

    Promise.all([
      import('./arena-scene'),
      document.fonts.load(`400 40px ${displayFont.style.fontFamily}`),
    ]).then(([{ createArenaScene }]) => {
      if (cancelled) return;

      scene = createArenaScene({
        host,
        tagHost,
        data: latest.current.sceneData,
        displayFont: displayFont.style.fontFamily,
        tagClassName: styles.tag,
        hotTagClassName: styles.tagHot,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onFocusChange: chooseFocus,
        onPokemonActivate: (playerIndex, slotIndex) => {
          const pokemon = latest.current.data.players[playerIndex]?.team
            .find(member => member.teamSlot === slotIndex + 1);
          if (pokemon) latest.current.openPokemonDetails({ ...pokemon, displayName: pokemon.nickname });
        },
        onFailure: () => setFailed(true),
      });
      scene.setFocus(latest.current.focus);
      scene.playShot(latest.current.directorShot);
      sceneRef.current = scene;
    }).catch(error => {
      console.error('Arena konnte nicht gestartet werden:', error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [chooseFocus, failed, rosterKey]);

  // Unter dem Overlay bliebe Rückruf und Rausschicken ungesehen, die Szene wartet deshalb darauf.
  useEffect(() => {
    if (!currentEvent) sceneRef.current?.update(sceneData);
  }, [currentEvent, sceneData]);

  useEffect(() => {
    sceneRef.current?.playShot(directorShot);
    if (!directorShot || currentEvent) return;

    const timer = window.setTimeout(() => setDirectorShot(null), getArenaShotHoldMs(directorShot));
    return () => window.clearTimeout(timer);
  }, [currentEvent, directorShot]);

  useEffect(() => {
    sceneRef.current?.setFocus(focus);
  }, [focus]);

  if (failed) return fallback;

  const { run, players, playerTotals } = data;
  const activeFocus = focus < players.length ? focus : TOTAL_VIEW;
  const spotlight = directorShot?.kind === 'player' ? directorShot.playerIndex : activeFocus;
  const totalKnockedOut = players.reduce((sum, player) => sum + player.stats.knockedOut, 0);

  return (
    <>
      <section
        className={`${styles.arena} ${bodyFont.className}`}
        style={{
          '--arena-display': displayFont.style.fontFamily,
          '--arena-body': bodyFont.style.fontFamily,
        } as CSSProperties}
        aria-labelledby="arena-title"
      >
        <div ref={stageRef} className={styles.stage} />
        <div ref={tagsRef} className={styles.tags} aria-hidden="true" />

        <header className={`${styles.panel} ${styles.title}`}>
          {run ? <b>#{run.number}</b> : null}
          <div>
            <h1 id="arena-title">{run?.gameName ?? 'Kein Run vorhanden'}</h1>
            {run ? (
              <p>
                <em data-tone={statusTone(run.status)}>{run.statusLabel}</em>, {formatDuration(run.durationMs)}
              </p>
            ) : null}
          </div>
        </header>

        <BadgeCase data={data} />

        <div className={styles.trainers}>
          {players.map((player, index) => (
            <TrainerBox
              key={player.id}
              player={player}
              losses={playerTotals.find(total => total.id === player.id)?.losses ?? null}
              focused={spotlight === index}
              onToggle={() => chooseFocus(spotlight === index ? TOTAL_VIEW : index)}
            />
          ))}
          {players.length > 0 ? (
            <button
              type="button"
              className={styles.total}
              aria-pressed={spotlight === TOTAL_VIEW}
              onClick={() => chooseFocus(TOTAL_VIEW)}
            >
              Totale
              <span>{totalKnockedOut} K.O.</span>
            </button>
          ) : (
            <p className={styles.panel}>Noch keine Spieler angelegt.</p>
          )}
        </div>
      </section>
      {children}
    </>
  );
}
