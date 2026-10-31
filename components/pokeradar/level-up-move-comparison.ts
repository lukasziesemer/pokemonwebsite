import type { LevelUpMove, PokemonDetailsResponse } from '@/lib/pokemon-details';

export type MoveColumnState = 'ready' | 'loading' | 'error' | 'unavailable';

export interface MoveComparisonColumn {
  pokedexId: number;
  state: MoveColumnState;
  moves: LevelUpMove[];
}

export interface MoveComparisonRow {
  move: LevelUpMove;
  /** null means unknown; an empty array means the loaded list lacks this move. */
  levels: (number[] | null)[];
}

export interface MoveComparisonFilters {
  type: string;
  onlyDifferences: boolean;
  levelCap: number | null;
}

export function getMoveComparisonColumns(
  pokemonIds: readonly number[],
  gameVersionKey: string | null,
  detailsById: Record<number, PokemonDetailsResponse | undefined>,
  errorsById: Record<number, string | undefined>,
): MoveComparisonColumn[] {
  return pokemonIds.map((pokedexId) => {
    const details = detailsById[pokedexId];
    if (!gameVersionKey) return { pokedexId, state: 'unavailable', moves: [] };
    if (errorsById[pokedexId]) return { pokedexId, state: 'error', moves: [] };
    if (!details) return { pokedexId, state: 'loading', moves: [] };
    if (details.edition?.key !== gameVersionKey || details.levelUpMoves === null) {
      return { pokedexId, state: 'unavailable', moves: [] };
    }
    return { pokedexId, state: 'ready', moves: details.levelUpMoves };
  });
}

export function buildLevelUpMoveRows(columns: readonly MoveComparisonColumn[]): MoveComparisonRow[] {
  const moveByName = new Map<string, LevelUpMove>();
  const levelsByColumn = columns.map((column) => {
    if (column.state !== 'ready') return null;
    const moveLevels = new Map<string, Set<number>>();
    for (const move of column.moves) {
      if (!moveByName.has(move.name)) moveByName.set(move.name, move);
      const levels = moveLevels.get(move.name) ?? new Set<number>();
      levels.add(move.level);
      moveLevels.set(move.name, levels);
    }
    return moveLevels;
  });

  return Array.from(moveByName.values(), (move) => ({
    move,
    levels: levelsByColumn.map((column) => (
      column === null ? null : Array.from(column.get(move.name) ?? []).sort((a, b) => a - b)
    )),
  })).sort((a, b) => a.move.displayName.localeCompare(b.move.displayName, 'de'));
}

export function hasDifferentLearnLevels(row: MoveComparisonRow): boolean {
  // A failed or pending fetch must never masquerade as a gameplay difference.
  if (row.levels.length < 2 || row.levels.some((levels) => levels === null)) return false;
  const reference = row.levels[0] ?? [];
  return row.levels.slice(1).some((levels) => (
    levels?.length !== reference.length || levels.some((level, index) => level !== reference[index])
  ));
}

export function filterLevelUpMoveRows(
  rows: readonly MoveComparisonRow[],
  filters: MoveComparisonFilters,
): MoveComparisonRow[] {
  return rows.filter((row) => {
    if (filters.type && row.move.type !== filters.type) return false;
    if (filters.onlyDifferences && !hasDifferentLearnLevels(row)) return false;
    return filters.levelCap === null || row.levels.some((levels) => (
      levels?.some((level) => level <= filters.levelCap!)
    ));
  });
}
