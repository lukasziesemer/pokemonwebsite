import { describe, expect, it } from 'vitest';
import { buildOpenRoutes, getFirstFreeTeamSlot, type AdminDashboardEncounter, type AdminDashboardPlayer } from '@/app/admin/dashboard-model';
import { parseStatusFilter, parseTeamFilter } from '@/app/tabelle/table-filters';
import { filterRouteList } from '@/lib/route-list-filter';

function encounter(overrides: Record<string, unknown> = {}) {
  return {
    nickname: null,
    teamSlot: null,
    isKnockedOut: false,
    isNotCaught: false,
    pokemon: { name: 'bulbasaur', nameGerman: 'Bisasam' },
    ...overrides,
  };
}

const routes = [
  { id: 1, name: 'Route 1', encounters: [encounter({ teamSlot: 1 })] },
  { id: 2, name: 'Vertania-Wald', encounters: [encounter({ pokemon: { name: 'pikachu', nameGerman: 'Pikachu' } })] },
  { id: 3, name: 'Route 3', encounters: [] },
  { id: 4, name: 'Route 4', encounters: [encounter({ isKnockedOut: true, nickname: 'Blitz' })] },
  { id: 5, name: 'Route 5', encounters: [encounter({ isNotCaught: true })] },
];
const ids = (list: { id: number }[]) => list.map((route) => route.id);

describe('filterRouteList', () => {
  it('keeps the game order and sorts routes into views', () => {
    expect(ids(filterRouteList(routes, 'all', ''))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(filterRouteList(routes, 'open', ''))).toEqual([2, 3]);
    expect(ids(filterRouteList(routes, 'team', ''))).toEqual([1]);
    expect(ids(filterRouteList(routes, 'inactive', ''))).toEqual([4, 5]);
  });

  it('searches route names, Pokémon and nicknames without regard to case', () => {
    expect(ids(filterRouteList(routes, 'all', ' vertania '))).toEqual([2]);
    expect(ids(filterRouteList(routes, 'all', 'PIKACHU'))).toEqual([2]);
    expect(ids(filterRouteList(routes, 'all', 'blitz'))).toEqual([4]);
    expect(ids(filterRouteList(routes, 'all', 'gibtsnicht'))).toEqual([]);
  });

  it('combines view and search', () => {
    expect(ids(filterRouteList(routes, 'inactive', 'route 5'))).toEqual([5]);
    expect(ids(filterRouteList(routes, 'open', 'route 5'))).toEqual([]);
  });
});

describe('parse table filters from the URL', () => {
  it('accepts known values and ignores everything else', () => {
    expect(parseTeamFilter('not-in-team')).toBe('not-in-team');
    expect(parseStatusFilter('active')).toBe('active');
    expect(parseTeamFilter('egal')).toBe('all');
    expect(parseStatusFilter(undefined)).toBe('all');
  });
});

describe('Admin dashboard open routes', () => {
  const openEncounter = (id: number, routeId: number) =>
    ({ id, route: { id: routeId, name: `Route ${routeId}` } }) as AdminDashboardEncounter;

  it('groups encounters by route, so two players count as one decision', () => {
    const open = buildOpenRoutes([openEncounter(1, 7), openEncounter(2, 7), openEncounter(3, 8)], 2);

    expect(open).toHaveLength(2);
    expect(open[0]).toMatchObject({ routeId: 7, routeName: 'Route 7', isComplete: true });
    expect(open[1]).toMatchObject({ routeId: 8, isComplete: false });
  });

  it('never calls a route complete without players', () => {
    expect(buildOpenRoutes([openEncounter(1, 7)], 0)[0].isComplete).toBe(false);
  });

  it('finds the first slot that no player uses', () => {
    const player = (slots: number[]) =>
      ({ teamMembers: slots.map((teamSlot) => ({ teamSlot })) }) as AdminDashboardPlayer;

    expect(getFirstFreeTeamSlot([player([1, 2]), player([1, 3])])).toBe(4);
    expect(getFirstFreeTeamSlot([player([1, 2, 3, 4, 5, 6])])).toBeNull();
  });
});
