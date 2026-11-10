import { describe, expect, it } from 'vitest';
import type { DashboardPokemon } from '@/app/dashboard-data';
import {
  getDurationClock,
  getReadableInk,
  getSpotlightForEvent,
  getTeamSlots,
  TEAM_SLOT_COUNT,
} from '@/components/dashboard/dashboard-view';
import type { EventType, GameEvent } from '@/lib/event-store';

const players = [
  { id: 11, name: 'Lukas' },
  { id: 12, name: 'Thorben' },
  { id: 13, name: 'Timo' },
];

function createPokemon(teamSlot: number): DashboardPokemon {
  return {
    id: teamSlot,
    pokedexId: 134,
    name: 'vaporeon',
    nameGerman: 'Aquana',
    types: ['water'],
    spriteUrl: null,
    spriteGifUrl: null,
    nickname: null,
    teamSlot,
    hp: 130,
    attack: 65,
    defense: 60,
    spAttack: 110,
    spDefense: 95,
    speed: 65,
  };
}

function createEvent(type: EventType, data: GameEvent['data'] = {}): GameEvent {
  return { id: 'event-1', type, timestamp: 1, data };
}

describe('getTeamSlots', () => {
  it('places team members on their slots and leaves the rest free', () => {
    const slots = getTeamSlots({ team: [createPokemon(5), createPokemon(2)] });

    expect(slots).toHaveLength(TEAM_SLOT_COUNT);
    expect(slots.map(pokemon => pokemon?.teamSlot ?? null)).toEqual([null, 2, null, null, 5, null]);
  });
});

describe('getDurationClock', () => {
  it('splits a long run into days and a clock', () => {
    const duration = ((93 * 24 + 1) * 3_600 + 32 * 60 + 7) * 1000;

    expect(getDurationClock(duration)).toEqual({ days: 93, clock: '01:32:07' });
  });

  it('never shows a negative duration', () => {
    expect(getDurationClock(-5_000)).toEqual({ days: 0, clock: '00:00:00' });
  });
});

describe('getReadableInk', () => {
  it('uses dark ink on light player colors', () => {
    expect(getReadableInk('#7ff3f2')).toBe('#081426');
    expect(getReadableInk('#ff8000')).toBe('#081426');
    expect(getReadableInk('#fc0')).toBe('#081426');
  });

  it('uses white ink on dark player colors', () => {
    expect(getReadableInk('#20406f')).toBe('#ffffff');
    expect(getReadableInk('#7a0010')).toBe('#ffffff');
  });

  it('falls back to white for colors it cannot read', () => {
    expect(getReadableInk('rebeccapurple')).toBe('#ffffff');
  });
});

describe('getSpotlightForEvent', () => {
  it('lights the player who caused a knockout', () => {
    const spotlight = getSpotlightForEvent(createEvent('pokemon_ko', { playerName: 'Timo' }), players);

    expect(spotlight).toEqual({ kind: 'player', playerId: 13, tone: 'ko' });
  });

  it('uses the escape tone for a missed catch', () => {
    const spotlight = getSpotlightForEvent(createEvent('pokemon_not_caught', { playerName: 'Lukas' }), players);

    expect(spotlight).toEqual({ kind: 'player', playerId: 11, tone: 'escape' });
  });

  it('lights nothing for an unknown player', () => {
    expect(getSpotlightForEvent(createEvent('pokemon_ko', { playerName: 'Gast' }), players)).toBeNull();
  });

  it.each(['team_link_added', 'team_link_boxed'] as const)('lights the team slot for %s', type => {
    expect(getSpotlightForEvent(createEvent(type, { teamSlot: 3 }), players)).toEqual({ kind: 'slot', teamSlot: 3 });
  });

  it('ignores a team slot outside the team', () => {
    expect(getSpotlightForEvent(createEvent('team_link_added', { teamSlot: 9 }), players)).toBeNull();
    expect(getSpotlightForEvent(createEvent('team_link_boxed'), players)).toBeNull();
  });

  it('lights the badges for a new badge', () => {
    expect(getSpotlightForEvent(createEvent('badge_unlocked'), players)).toEqual({ kind: 'badges' });
  });

  it.each(['run_failed', 'run_completed'] as const)('lights the balance for %s', type => {
    expect(getSpotlightForEvent(createEvent(type), players)).toEqual({ kind: 'balance' });
  });
});
