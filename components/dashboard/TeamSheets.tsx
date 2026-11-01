"use client";

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { DashboardPlayer } from '@/app/dashboard-data';
import { PokemonDetailsTrigger } from '@/components/pokemon-details';
import { useSpriteMode } from '@/lib/contexts/SpriteContext';
import { getTypeColor } from '@/lib/design-tokens';
import { getSpriteUrl } from '@/lib/sprite-utils';
import { getAverageTeamStrength } from '@/lib/team-base-stats';
import { getGermanTypeName } from '@/lib/typeEffectiveness';
import DefensiveCoverageMap from './DefensiveCoverageMap';

export function TeamSheet({ player }: { player: DashboardPlayer }) {
  const { spriteMode } = useSpriteMode();
  const slots = Array.from({ length: 6 }, (_, index) =>
    player.team.find(pokemon => pokemon.teamSlot === index + 1) ?? null
  );
  const teamAverage = getAverageTeamStrength(player.team);

  return (
    <article
      className="dashboard-team-sheet app-player-rule"
      style={{ '--player-accent': player.color } as CSSProperties}
    >
      <header className="dashboard-team-header">
        <div className="dashboard-player-title">
          <h3>{player.name}</h3>
          <span className="dashboard-team-average">
            <strong>Ø {teamAverage ?? '–'}</strong> Gesamt-BP
          </span>
        </div>
        <div className="dashboard-personal-stats" aria-label={`Statistik von ${player.name} im aktuellen Run`}>
          <span><strong>{player.stats.knockedOut}</strong> K.O.</span>
          <span><strong>{player.stats.notCaught}</strong> nicht gefangen</span>
        </div>
      </header>

      <ol className="dashboard-team-slots" aria-label={`Team von ${player.name}`}>
        {slots.map((pokemon, index) => (
          <li key={pokemon?.id ?? `empty-${index}`} className={pokemon ? 'is-occupied' : 'is-empty'}>
            {pokemon ? (
              <PokemonDetailsTrigger
                pokemon={pokemon}
                className="dashboard-pokemon-stat-trigger"
              >
                <span className="dashboard-slot-number">{index + 1}</span>
                <Image
                  src={getSpriteUrl(pokemon, spriteMode) ?? '/pokeball.svg'}
                  alt=""
                  width={72}
                  height={72}
                  sizes="(max-width: 767px) 44px, 64px"
                  className="dashboard-pokemon-sprite"
                  unoptimized={spriteMode === 'animated' && Boolean(pokemon.spriteGifUrl)}
                />
                <strong title={pokemon.nickname ? `${pokemon.nameGerman ?? pokemon.name} (${pokemon.nickname})` : undefined}>
                  {pokemon.nickname ?? pokemon.nameGerman ?? pokemon.name}
                </strong>
                {pokemon.nickname ? <small>{pokemon.nameGerman ?? pokemon.name}</small> : null}
                <span className="dashboard-type-list">
                  {pokemon.types.length > 0 ? pokemon.types.map(type => (
                    <span
                      key={type}
                      className="dashboard-type-tag"
                      style={{ '--type-accent': getTypeColor(type) } as CSSProperties}
                    >
                      {getGermanTypeName(type)}
                    </span>
                  )) : <span className="dashboard-empty-value">–</span>}
                </span>
              </PokemonDetailsTrigger>
            ) : (
              <>
                <span className="dashboard-slot-number">{index + 1}</span>
                <span className="dashboard-empty-slot" aria-hidden="true">–</span>
                <strong>Leer</strong>
                <div className="dashboard-type-list"><span className="dashboard-empty-value">–</span></div>
              </>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

function PlayerCoverage({ player }: { player: DashboardPlayer }) {
  return (
    <details className="dashboard-defense-disclosure">
      <summary>
        <span>
          <strong>Defensive Coverage {player.name}</strong>
          <small>{player.team.length} Pokémon · 18 Angriffstypen</small>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </summary>
      <DefensiveCoverageMap player={player} />
    </details>
  );
}

function PlayerTeamCoverage({ player }: { player: DashboardPlayer }) {
  return (
    <div
      className="dashboard-player-team-block"
      style={{ '--player-accent': player.color } as CSSProperties}
    >
      <TeamSheet player={player} />
      <PlayerCoverage player={player} />
    </div>
  );
}

export function TeamCoverageSection({ players }: { players: DashboardPlayer[] }) {
  if (players.length === 0) return null;

  return (
    <section aria-labelledby="team-coverage-title">
      <h2 id="team-coverage-title" className="app-section-title">Defensive Coverage</h2>
      <div className="dashboard-player-team-stack">
        {players.map(player => (
          <div
            key={player.id}
            className="dashboard-player-team-block"
            style={{ '--player-accent': player.color } as CSSProperties}
          >
            <PlayerCoverage player={player} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TeamSheets({ players }: { players: DashboardPlayer[] }) {
  return (
    <section aria-labelledby="current-teams-title">
      <h2 id="current-teams-title" className="app-section-title">Aktuelle Teams</h2>
      {players.length > 0 ? (
        <div className="dashboard-player-team-stack">
          {players.map(player => (
            <PlayerTeamCoverage key={player.id} player={player} />
          ))}
        </div>
      ) : (
        <p className="dashboard-empty-state">Noch keine Spieler angelegt.</p>
      )}
    </section>
  );
}
