import { describe, expect, it } from 'vitest';
import {
  compareRoutesByOrder,
  encounterMatchesTableFilters,
  rowMatchesTableFilters,
  type FilterableEncounterCell,
} from '@/app/tabelle/table-filters';

function createCell(
  teamSlot: number | null,
  isKnockedOut = false,
  isNotCaught = false,
): FilterableEncounterCell {
  return { encounter: { teamSlot, isKnockedOut, isNotCaught } };
}

describe('Encounter table filters', () => {
  it('separates team membership from encounter status', () => {
    const activeTeamMember = createCell(2);

    expect(encounterMatchesTableFilters(activeTeamMember, 'in-team', 'active')).toBe(true);
    expect(encounterMatchesTableFilters(activeTeamMember, 'not-in-team', 'active')).toBe(false);
    expect(encounterMatchesTableFilters(activeTeamMember, 'all', 'knocked-out')).toBe(false);
  });

  it('matches knocked-out and not-caught states explicitly', () => {
    expect(encounterMatchesTableFilters(createCell(null, true), 'all', 'knocked-out')).toBe(true);
    expect(encounterMatchesTableFilters(createCell(null, false, true), 'all', 'not-caught')).toBe(true);
    expect(encounterMatchesTableFilters(createCell(null, true), 'all', 'active')).toBe(false);
  });

  it('keeps a route when at least one player encounter satisfies both filters', () => {
    const cells = [createCell(1), null, createCell(null, true)];

    expect(rowMatchesTableFilters(cells, 'in-team', 'active')).toBe(true);
    expect(rowMatchesTableFilters(cells, 'not-in-team', 'knocked-out')).toBe(true);
    expect(rowMatchesTableFilters(cells, 'in-team', 'knocked-out')).toBe(false);
  });

  it('keeps empty route rows only when no filters are active', () => {
    expect(rowMatchesTableFilters([null, null], 'all', 'all')).toBe(true);
    expect(rowMatchesTableFilters([null, null], 'all', 'active')).toBe(false);
  });
});

describe('Routen-Sortierung', () => {
  it('folgt der Routenreihenfolge statt dem Alphabet', () => {
    const routes = [
      { name: 'Route 21', order: 3 },
      { name: 'Route 4', order: 1 },
      { name: 'Route 19', order: 2 },
    ];

    expect([...routes].sort(compareRoutesByOrder).map((route) => route.name)).toEqual([
      'Route 4',
      'Route 19',
      'Route 21',
    ]);
  });

  it('nutzt bei gleicher Reihenfolge den Namen', () => {
    const routes = [
      { name: 'Route B', order: 0 },
      { name: 'Route A', order: 0 },
    ];

    expect([...routes].sort(compareRoutesByOrder).map((route) => route.name)).toEqual([
      'Route A',
      'Route B',
    ]);
  });
});
