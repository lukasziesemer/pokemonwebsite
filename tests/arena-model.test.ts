import { describe, expect, it } from 'vitest';
import type { DashboardData, DashboardPlayer, DashboardPokemon } from '@/app/dashboard-data';
import {
  getArenaAnchors,
  getArenaRosterKey,
  TEAM_SLOT_COUNT,
  toArenaSceneData,
} from '@/components/dashboard/arena/arena-model';
import { typeColors } from '@/lib/design-tokens';

function createPokemon(overrides: Partial<DashboardPokemon> = {}): DashboardPokemon {
  return {
    id: 1,
    pokedexId: 134,
    name: 'Vaporeon',
    nameGerman: 'Aquana',
    types: ['water'],
    spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/134.png',
    spriteGifUrl: null,
    nickname: null,
    teamSlot: 5,
    hp: 130,
    attack: 65,
    defense: 60,
    spAttack: 110,
    spDefense: 95,
    speed: 65,
    ...overrides,
  };
}

function createPlayer(overrides: Partial<DashboardPlayer> = {}): DashboardPlayer {
  return {
    id: 1,
    name: 'Lukas',
    color: '#ff8a1f',
    avatar: null,
    team: [],
    stats: { knockedOut: 3, notCaught: 2 },
    ...overrides,
  };
}

function createData(players: DashboardPlayer[], run: DashboardData['run'] = null): DashboardData {
  return {
    run,
    badges: [],
    players,
    playerTotals: [],
    totals: { wins: 0, losses: 0, winRate: null, knockedOut: 0, notCaught: 0 },
  };
}

describe('toArenaSceneData', () => {
  it('places team members on their team slots and keeps free slots empty', () => {
    const scene = toArenaSceneData(createData([createPlayer({ team: [createPokemon()] })]));
    const slots = scene.players[0].slots;

    expect(slots).toHaveLength(TEAM_SLOT_COUNT);
    expect(slots[4]).toMatchObject({ name: 'Aquana', baseTotal: 525, typeColor: typeColors.water });
    expect(slots.filter(Boolean)).toHaveLength(1);
  });

  it('prefers the nickname as the visible name', () => {
    const scene = toArenaSceneData(createData([
      createPlayer({ team: [createPokemon({ nickname: 'Blubb' })] }),
    ]));

    expect(scene.players[0].slots[4]?.name).toBe('Blubb');
  });

  it('changes the slot key on evolution so the arena sends the Pokémon out again', () => {
    const before = toArenaSceneData(createData([createPlayer({ team: [createPokemon()] })]));
    const after = toArenaSceneData(createData([
      createPlayer({ team: [createPokemon({ pokedexId: 135 })] }),
    ]));

    expect(before.players[0].slots[4]?.key).not.toBe(after.players[0].slots[4]?.key);
  });

  it('handles a dashboard without a run', () => {
    const scene = toArenaSceneData(createData([]));

    expect(scene).toEqual({ runNumber: null, gameName: null, players: [] });
  });
});

describe('getArenaRosterKey', () => {
  it('stays stable when only stats or teams change', () => {
    const player = createPlayer();
    const changed = createPlayer({ stats: { knockedOut: 9, notCaught: 9 }, team: [createPokemon()] });

    expect(getArenaRosterKey([player])).toBe(getArenaRosterKey([changed]));
  });

  it('changes when a player is added or recolored', () => {
    const base = getArenaRosterKey([createPlayer()]);

    expect(getArenaRosterKey([createPlayer(), createPlayer({ id: 2 })])).not.toBe(base);
    expect(getArenaRosterKey([createPlayer({ color: '#000000' })])).not.toBe(base);
  });
});

describe('getArenaAnchors', () => {
  it.each([0, 1, 2, 3, 4, 6, 8])('returns one podium per player for %i players', count => {
    expect(getArenaAnchors(count)).toHaveLength(count);
  });

  it('keeps many podiums inside the battlefield without overlap', () => {
    const anchors = getArenaAnchors(6);

    anchors.forEach(anchor => expect(Math.abs(anchor.x)).toBeLessThan(50));
    anchors.slice(1).forEach((anchor, index) => {
      const gap = anchor.x - anchors[index].x;
      expect(gap).toBeGreaterThan(0);
    });
  });
});
