import type { GameEvent } from '@/lib/event-store';

export type ArenaShot =
  | { kind: 'player'; playerIndex: number }
  | { kind: 'total' | 'board' | 'crane' };

const DEFAULT_HOLD_MS = 4_500;
const RUN_END_HOLD_MS = 7_000;
const MIN_BOARD_DISTANCE = 74;
const BOARD_FRAME_WIDTH = 74;

/** Welche Einstellung zeigt, was gerade passiert ist. */
export function getArenaShotForEvent(
  event: GameEvent,
  players: readonly { name: string }[],
): ArenaShot {
  switch (event.type) {
    case 'pokemon_ko':
    case 'pokemon_not_caught': {
      const playerIndex = players.findIndex(player => player.name === event.data.playerName);
      return playerIndex >= 0 ? { kind: 'player', playerIndex } : { kind: 'total' };
    }
    case 'badge_unlocked':
      return { kind: 'board' };
    case 'run_failed':
    case 'run_completed':
      return { kind: 'crane' };
    case 'team_link_added':
    case 'team_link_boxed':
      // Eine Bindung betrifft alle Spieler, nur die Totale zeigt alle Podeste zugleich.
      return { kind: 'total' };
  }
}

/** Mindestabstand, bei dem die ganze Anzeigetafel samt Rand ins Bild passt. */
export function getArenaBoardDistance(fovDegrees: number, aspect: number): number {
  const halfTan = Math.tan((fovDegrees / 2) * (Math.PI / 180));
  return Math.max(MIN_BOARD_DISTANCE, BOARD_FRAME_WIDTH / (2 * halfTan * aspect));
}

/** So lange bleibt die Einstellung stehen, nachdem das Overlay verschwunden ist. */
export function getArenaShotHoldMs(shot: ArenaShot): number {
  return shot.kind === 'crane' ? RUN_END_HOLD_MS : DEFAULT_HOLD_MS;
}
