import type { DashboardData } from '@/app/dashboard-data';
import { getTypeColor } from '@/lib/design-tokens';
import { getTeamPokemonTotal } from '@/lib/team-base-stats';

export const TEAM_SLOT_COUNT = 6;

export interface ArenaPokemon {
  /** Ändert sich bei neuem Fang oder Entwicklung und löst das Rausschicken aus. */
  key: string;
  name: string;
  baseTotal: number;
  typeColor: string;
  spriteUrl: string | null;
}

export interface ArenaPlayer {
  id: number;
  name: string;
  color: string;
  knockedOut: number;
  slots: (ArenaPokemon | null)[];
}

export interface ArenaSceneData {
  runNumber: number | null;
  gameName: string | null;
  badgesEarned: number;
  badgeTotal: number;
  players: ArenaPlayer[];
}

export interface ArenaAnchor {
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

const FALLBACK_TYPE_COLOR = '#aab09f';

export function toArenaSceneData(data: DashboardData): ArenaSceneData {
  return {
    runNumber: data.run?.number ?? null,
    gameName: data.run?.gameName ?? null,
    badgesEarned: data.run?.badgesEarned ?? 0,
    badgeTotal: data.badges.length,
    players: data.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      knockedOut: player.stats.knockedOut,
      slots: Array.from({ length: TEAM_SLOT_COUNT }, (_, index) => {
        const pokemon = player.team.find(member => member.teamSlot === index + 1);
        if (!pokemon) return null;

        return {
          key: `${pokemon.id}:${pokemon.pokedexId}`,
          name: pokemon.nickname ?? pokemon.nameGerman ?? pokemon.name,
          baseTotal: getTeamPokemonTotal(pokemon),
          typeColor: pokemon.types[0] ? getTypeColor(pokemon.types[0]) : FALLBACK_TYPE_COLOR,
          spriteUrl: pokemon.spriteUrl,
        };
      }),
    })),
  };
}

/** Neue, entfernte oder umgefärbte Spieler brauchen einen Neuaufbau der Szene. */
export function getArenaRosterKey(players: readonly Pick<ArenaPlayer, 'id' | 'name' | 'color'>[]): string {
  return players.map(player => `${player.id}:${player.name}:${player.color}`).join('|');
}

/** Hochkant passt die Totale nicht ins Bild, dort bleibt immer ein Spieler im Fokus. */
export function resolveArenaFocus(
  requested: number,
  current: number,
  playerCount: number,
  portrait: boolean,
): number {
  if (!portrait || requested >= 0 || playerCount === 0) return requested;
  return current >= 0 ? current : Math.min(1, playerCount - 1);
}

export function getArenaAnchors(count: number): ArenaAnchor[] {
  if (count === 1) return [{ x: 0, z: -6, yaw: 0, scale: 1.2 }];
  if (count === 2) {
    return [
      { x: -20, z: -3, yaw: 0.16, scale: 1.08 },
      { x: 20, z: -3, yaw: -0.16, scale: 1.08 },
    ];
  }
  if (count === 3) {
    return [
      { x: -29, z: 2, yaw: 0.26, scale: 1 },
      { x: 0, z: -11.5, yaw: 0, scale: 1.14 },
      { x: 29, z: 2, yaw: -0.26, scale: 1 },
    ];
  }

  const scale = Math.max(0.5, 3.2 / count);
  return Array.from({ length: count }, (_, index) => {
    const x = (index - (count - 1) / 2) * (86 / count);
    return { x, z: index % 2 === 0 ? 0 : -10, yaw: -x / 110, scale };
  });
}
