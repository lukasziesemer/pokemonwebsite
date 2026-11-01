import { describe, expect, it } from 'vitest';
import { getArenaShotForEvent, getArenaShotHoldMs } from '@/components/dashboard/arena/arena-director';
import type { EventType, GameEvent } from '@/lib/event-store';

const players = [{ name: 'Lukas' }, { name: 'Thorben' }, { name: 'Timo' }];

function createEvent(type: EventType, data: GameEvent['data'] = {}): GameEvent {
  return { id: 'event-1', type, timestamp: 1, data };
}

describe('getArenaShotForEvent', () => {
  it.each(['pokemon_ko', 'pokemon_not_caught'] as const)('shows the affected player for %s', type => {
    const shot = getArenaShotForEvent(createEvent(type, { playerName: 'Timo' }), players);

    expect(shot).toEqual({ kind: 'player', playerIndex: 2 });
  });

  it('falls back to the total view for an unknown player', () => {
    const shot = getArenaShotForEvent(createEvent('pokemon_ko', { playerName: 'Gast' }), players);

    expect(shot).toEqual({ kind: 'total' });
  });

  it('falls back to the total view without a player name', () => {
    expect(getArenaShotForEvent(createEvent('pokemon_ko'), players)).toEqual({ kind: 'total' });
  });

  it.each(['team_link_added', 'team_link_boxed'] as const)('shows every podium for %s', type => {
    expect(getArenaShotForEvent(createEvent(type), players)).toEqual({ kind: 'total' });
  });

  it('shows the scoreboard for a new badge', () => {
    expect(getArenaShotForEvent(createEvent('badge_unlocked'), players)).toEqual({ kind: 'board' });
  });

  it.each(['run_failed', 'run_completed'] as const)('rises to the crane shot for %s', type => {
    expect(getArenaShotForEvent(createEvent(type), players)).toEqual({ kind: 'crane' });
  });
});

describe('getArenaShotHoldMs', () => {
  it('holds the end of a run longer than a regular event', () => {
    expect(getArenaShotHoldMs({ kind: 'crane' })).toBeGreaterThan(getArenaShotHoldMs({ kind: 'total' }));
  });
});
