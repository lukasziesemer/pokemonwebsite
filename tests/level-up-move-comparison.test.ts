import { describe, expect, it } from 'vitest';
import type { LevelUpMove, PokemonDetailsResponse } from '@/lib/pokemon-details';
import {
  buildLevelUpMoveRows,
  filterLevelUpMoveRows,
  getMoveComparisonColumns,
  hasDifferentLearnLevels,
  type MoveComparisonColumn,
} from '@/components/pokeradar/level-up-move-comparison';

function move(name: string, level: number, type = 'water'): LevelUpMove {
  return { name, displayName: name, nameGerman: name, level, type, order: 0, damageClass: 'special', power: 40, accuracy: 100, pp: 25 };
}

function ready(pokedexId: number, moves: LevelUpMove[]): MoveComparisonColumn {
  return { pokedexId, moves, state: 'ready' };
}

function details(levelUpMoves: LevelUpMove[] | null, editionKey: string | null = 'black2'): PokemonDetailsResponse {
  return {
    pokemon: { pokedexId: 7, name: 'squirtle', nameGerman: 'Schiggy', displayName: 'Schiggy', types: ['water'], spriteUrl: null, spriteGifUrl: null, stats: { hp: 44, attack: 48, defense: 65, spAttack: 50, spDefense: 64, speed: 43, total: 314 } },
    edition: editionKey ? { key: editionKey, name: editionKey, versionSlug: editionKey, versionGroupSlug: editionKey } : null,
    levelUpMoves,
    evolution: { nodes: [], edges: [] },
    cache: { status: 'hit', fetchedAt: '2026-09-05T00:00:00Z', expiresAt: '2026-10-05T00:00:00Z', stale: false },
  };
}

describe('level-up move comparison', () => {
  it('unites moves in selection order and preserves distinct repeated learn levels', () => {
    const rows = buildLevelUpMoveRows([
      ready(7, [move('Aquaknarre', 13), move('Aquaknarre', 1), move('Aquaknarre', 13)]),
      ready(4, [move('Glut', 7, 'fire')]),
    ]);
    expect(rows.map((row) => [row.move.name, row.levels])).toEqual([
      ['Aquaknarre', [[1, 13], []]],
      ['Glut', [[], [7]]],
    ]);
  });

  it('keeps failed, pending and unavailable data distinct from a loaded empty move list', () => {
    const columns = getMoveComparisonColumns([1, 2, 3, 4, 5], 'black2', {
      1: details([move('Aquaknarre', 13)]),
      4: details([]),
      5: details(null),
    }, { 2: 'Network failure' });
    expect(columns.map((column) => column.state)).toEqual(['ready', 'error', 'loading', 'ready', 'unavailable']);
    const [row] = buildLevelUpMoveRows(columns);
    expect(row.levels).toEqual([[13], null, null, [], null]);
    expect(hasDifferentLearnLevels(row)).toBe(false);
  });

  it('does not show moves from another edition or when the run has no edition', () => {
    const responses = { 7: details([move('Aquaknarre', 13)], 'white') };
    expect(buildLevelUpMoveRows(getMoveComparisonColumns([7], 'black2', responses, {}))).toEqual([]);
    expect(buildLevelUpMoveRows(getMoveComparisonColumns([7], null, responses, {}))).toEqual([]);
  });

  it('detects different learn levels and missing moves, but not identical level sets', () => {
    const rows = buildLevelUpMoveRows([
      ready(7, [move('Aquaknarre', 13), move('Blubber', 1), move('Tackle', 1, 'normal')]),
      ready(8, [move('Aquaknarre', 15), move('Tackle', 1, 'normal')]),
    ]);
    expect(filterLevelUpMoveRows(rows, { type: '', levelCap: null, onlyDifferences: true }).map((row) => row.move.name)).toEqual(['Aquaknarre', 'Blubber']);
  });

  it('compares complete level arrays, including moves learned again later', () => {
    const rows = buildLevelUpMoveRows([
      ready(7, [move('Aquaknarre', 1), move('Aquaknarre', 13)]),
      ready(8, [move('Aquaknarre', 1)]),
    ]);
    expect(hasDifferentLearnLevels(rows[0])).toBe(true);
    expect(filterLevelUpMoveRows(rows, { type: '', levelCap: 10, onlyDifferences: true })).toHaveLength(1);
  });

  it('combines type and inclusive level-cap filters while preserving later learn levels', () => {
    const rows = buildLevelUpMoveRows([
      ready(7, [move('Aquaknarre', 13), move('Blubber', 14), move('Tackle', 1, 'normal')]),
      ready(8, [move('Aquaknarre', 15)]),
    ]);
    const filtered = filterLevelUpMoveRows(rows, { type: 'water', levelCap: 13, onlyDifferences: false });
    expect(filtered.map((row) => row.move.name)).toEqual(['Aquaknarre']);
    expect(filtered[0].levels).toEqual([[13], [15]]);
  });

  it('keeps level zero entries and does not invent differences with one Pokémon', () => {
    const rows = buildLevelUpMoveRows([ready(7, [move('Aquaknarre', 0)])]);
    expect(filterLevelUpMoveRows(rows, { type: '', levelCap: 0, onlyDifferences: false })).toHaveLength(1);
    expect(hasDifferentLearnLevels(rows[0])).toBe(false);
  });
});
