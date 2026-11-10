'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { DashboardPlayer, DashboardPokemon } from '@/app/dashboard-data';
import PlayerAvatar from '@/components/PlayerAvatar';
import { PokemonDetailsTrigger } from '@/components/pokemon-details';
import { useSpriteMode } from '@/lib/contexts/SpriteContext';
import { getTypeColor } from '@/lib/design-tokens';
import { getSpriteUrl } from '@/lib/sprite-utils';
import { getAverageTeamStrength, getTeamPokemonTotal } from '@/lib/team-base-stats';
import { getGermanTypeName } from '@/lib/typeEffectiveness';
import CoverageGrid from './CoverageGrid';
import RollingNumber from './RollingNumber';
import { getDisplayName, getReadableInk, getSpeciesName, getTeamSlots } from './dashboard-view';
import styles from './Dashboard.module.css';

const FALLBACK_TYPE_COLOR = '#aab09f';

interface SlotState {
  linkedSlot: number | null;
  tourSlot: number | null;
  flashSlot: number | null;
  onSlotHover: (slot: number | null) => void;
}

interface TeamPanelProps extends SlotState {
  player: DashboardPlayer;
  index: number;
  /** Nach einem K.O. oder verpassten Fang steht dieses Team kurz im Mittelpunkt. */
  lit: 'ko' | 'escape' | null;
}

function SlotCard({
  pokemon,
  slot,
  linkedSlot,
  tourSlot,
  flashSlot,
  onSlotHover,
}: SlotState & { pokemon: DashboardPokemon | null; slot: number }) {
  const { spriteMode } = useSpriteMode();
  const state = {
    'data-linked': linkedSlot === slot ? 'true' : undefined,
    'data-tour': tourSlot === slot ? 'true' : undefined,
    'data-flash': flashSlot === slot ? 'true' : undefined,
  };

  if (!pokemon) {
    return (
      <li className={styles.slot} style={{ '--i': slot - 1 } as CSSProperties} {...state}>
        <div className={styles.emptySlot}>
          <span className={styles.slotNumber} aria-hidden="true">{slot}</span>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="44" />
            <path d="M6 50h28M66 50h28" />
            <circle cx="50" cy="50" r="16" />
          </svg>
          <span>Platz {slot} frei</span>
        </div>
      </li>
    );
  }

  const [typeA = FALLBACK_TYPE_COLOR, typeB = typeA] = pokemon.types.map(getTypeColor);
  const animated = spriteMode === 'animated' && Boolean(pokemon.spriteGifUrl);
  const sprite = getSpriteUrl(pokemon, spriteMode) ?? '/pokeball.svg';
  const name = getDisplayName(pokemon);

  return (
    <li
      className={styles.slot}
      style={{ '--i': slot - 1, '--type-a': typeA, '--type-b': typeB } as CSSProperties}
      {...state}
    >
      <PokemonDetailsTrigger
        pokemon={{ ...pokemon, displayName: pokemon.nickname }}
        className={styles.card}
        onPointerEnter={() => onSlotHover(slot)}
        onPointerLeave={() => onSlotHover(null)}
        onFocus={event => {
          // Nur Tastaturfokus: Nach einem Mausklick bliebe die Hervorhebung sonst hängen.
          if (event.currentTarget.matches(':focus-visible')) onSlotHover(slot);
        }}
        onBlur={() => onSlotHover(null)}
      >
        <span className={styles.plate} aria-hidden="true" />
        <span className={styles.slotNumber} aria-hidden="true">{slot}</span>
        <span className={styles.art} data-animated={animated ? 'true' : undefined}>
          <Image
            key={sprite}
            src={sprite}
            alt=""
            fill
            sizes="(max-width: 1099px) 30vw, 200px"
            unoptimized={animated}
          />
        </span>
        <span className={styles.caption}>
          <strong className={styles.name}>{name}</strong>
          <span className={styles.bp}><b>{getTeamPokemonTotal(pokemon)}</b> BP</span>
          {pokemon.nickname ? <small className={styles.species}>{getSpeciesName(pokemon)}</small> : null}
          <span className={styles.types}>
            {pokemon.types.map(type => (
              <span
                key={type}
                className={styles.type}
                style={{ '--type': getTypeColor(type) } as CSSProperties}
                title={getGermanTypeName(type)}
              >
                <span className={styles.typeIcon}>
                  <Image src={`/icons/types/${type}.svg`} alt="" width={12} height={12} />
                </span>
                <span className={styles.typeLabel}>{getGermanTypeName(type)}</span>
              </span>
            ))}
          </span>
        </span>
      </PokemonDetailsTrigger>
    </li>
  );
}

export default function TeamPanel({ player, index, lit, ...slotState }: TeamPanelProps) {
  const average = getAverageTeamStrength(player.team);
  const titleId = `team-${player.id}-title`;
  const panelStyle = {
    '--player': player.color,
    '--player-ink': getReadableInk(player.color),
    '--panel-i': index,
  } as CSSProperties;

  return (
    <article className={styles.panel} style={panelStyle} data-lit={lit ?? undefined} aria-labelledby={titleId}>
      <header className={styles.panelHead}>
        <PlayerAvatar
          avatar={player.avatar}
          name={player.name}
          color="#061a32"
          size={44}
          className={styles.avatar}
        />
        <h2 id={titleId} className={styles.panelName}>{player.name}</h2>
        <dl className={styles.panelStats} aria-label={`Statistik von ${player.name} im aktuellen Run`}>
          <div className={styles.stat}>
            <dt>Ø BP</dt>
            <dd>{average === null ? '–' : <RollingNumber value={average} />}</dd>
          </div>
          <div className={styles.stat} data-tone="ko">
            <dt>K.O.</dt>
            <dd><RollingNumber value={player.stats.knockedOut} /></dd>
          </div>
          <div className={styles.stat} data-tone="escape">
            <dt>Nicht gefangen</dt>
            <dd><RollingNumber value={player.stats.notCaught} /></dd>
          </div>
        </dl>
      </header>

      <ol className={styles.lineup} aria-label={`Team von ${player.name}`}>
        {getTeamSlots(player).map((pokemon, slotIndex) => (
          <SlotCard
            key={pokemon ? `${pokemon.id}:${pokemon.pokedexId}` : `free-${slotIndex}`}
            pokemon={pokemon}
            slot={slotIndex + 1}
            {...slotState}
          />
        ))}
      </ol>

      <CoverageGrid player={player} linkedSlot={slotState.linkedSlot} onSlotHover={slotState.onSlotHover} />
    </article>
  );
}
