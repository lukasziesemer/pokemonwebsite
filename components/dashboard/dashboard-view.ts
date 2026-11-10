import type { DashboardData, DashboardPlayer, DashboardPokemon } from '@/app/dashboard-data';
import type { GameEvent } from '@/lib/event-store';

export const TEAM_SLOT_COUNT = 6;

const DARK_INK = '#081426';
const LIGHT_INK = '#ffffff';

type RunStatus = NonNullable<DashboardData['run']>['status'];

export type DashboardSpotlight =
  | { kind: 'player'; playerId: number; tone: 'ko' | 'escape' }
  | { kind: 'slot'; teamSlot: number }
  | { kind: 'badges' }
  | { kind: 'balance' };

export function getTeamSlots(player: Pick<DashboardPlayer, 'team'>): (DashboardPokemon | null)[] {
  return Array.from({ length: TEAM_SLOT_COUNT }, (_, index) =>
    player.team.find(pokemon => pokemon.teamSlot === index + 1) ?? null,
  );
}

export function getDisplayName(pokemon: Pick<DashboardPokemon, 'nickname' | 'nameGerman' | 'name'>) {
  return pokemon.nickname ?? pokemon.nameGerman ?? pokemon.name;
}

export function getSpeciesName(pokemon: Pick<DashboardPokemon, 'nameGerman' | 'name'>) {
  return pokemon.nameGerman ?? pokemon.name;
}

export function statusTone(status: RunStatus) {
  if (status === 'paused') return 'paused';
  if (status === 'won') return 'complete';
  if (status === 'lost') return 'danger';
  return 'active';
}

export function formatDuration(durationMs: number) {
  const totalMinutes = Math.floor(durationMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} T ${hours} Std ${minutes} Min`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  return `${minutes} Min`;
}

/** Laufzeit als Tage plus Uhr, damit die Sekunden sichtbar mitlaufen können. */
export function getDurationClock(durationMs: number): { days: number; clock: string } {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const parts = [
    Math.floor((totalSeconds % 86_400) / 3_600),
    Math.floor((totalSeconds % 3_600) / 60),
    totalSeconds % 60,
  ];
  return { days, clock: parts.map(part => String(part).padStart(2, '0')).join(':') };
}

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const digits = match[1].length === 3
    ? Array.from(match[1], digit => digit + digit).join('')
    : match[1];
  const [red, green, blue] = [0, 2, 4].map(offset => {
    const channel = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Dunkle oder weiße Schrift, je nachdem, was auf der Spielerfarbe besser lesbar ist. */
export function getReadableInk(color: string): string {
  const luminance = relativeLuminance(color);
  if (luminance === null) return LIGHT_INK;

  const darkLuminance = relativeLuminance(DARK_INK) ?? 0;
  const contrastWithDark = (luminance + 0.05) / (darkLuminance + 0.05);
  const contrastWithLight = 1.05 / (luminance + 0.05);
  return contrastWithDark >= contrastWithLight ? DARK_INK : LIGHT_INK;
}

/** Welcher Teil der Tafel nach einem Ereignis hervorgehoben wird. */
export function getSpotlightForEvent(
  event: GameEvent,
  players: readonly Pick<DashboardPlayer, 'id' | 'name'>[],
): DashboardSpotlight | null {
  switch (event.type) {
    case 'pokemon_ko':
    case 'pokemon_not_caught': {
      const player = players.find(candidate => candidate.name === event.data.playerName);
      if (!player) return null;
      return { kind: 'player', playerId: player.id, tone: event.type === 'pokemon_ko' ? 'ko' : 'escape' };
    }
    case 'team_link_added':
    case 'team_link_boxed': {
      const { teamSlot } = event.data;
      return typeof teamSlot === 'number' && teamSlot >= 1 && teamSlot <= TEAM_SLOT_COUNT
        ? { kind: 'slot', teamSlot }
        : null;
    }
    case 'badge_unlocked':
      return { kind: 'badges' };
    case 'run_failed':
    case 'run_completed':
      return { kind: 'balance' };
  }
}
