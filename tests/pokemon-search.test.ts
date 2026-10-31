import { describe, expect, it } from 'vitest';
import { getOpenCaptureRoutes } from '@/components/admin/route-link-ui';
import { filterPokemonBySearch } from '@/lib/team-utils';

const pokemon = [
  { pokedexId: 1, name: 'bulbasaur', nameGerman: 'Bisasam' },
  { pokedexId: 11, name: 'metapod', nameGerman: 'Safcon' },
  { pokedexId: 150, name: 'mewtwo', nameGerman: 'Mewtu' },
  { pokedexId: 151, name: 'mew', nameGerman: 'Mew' },
  { pokedexId: 54, name: 'psyduck', nameGerman: 'Enton' },
];

describe('filterPokemonBySearch', () => {
  it('ranks exact names before longer names, because Enter takes the first hit', () => {
    expect(filterPokemonBySearch(pokemon, 'mew').map((p) => p.nameGerman)).toEqual(['Mew', 'Mewtu']);
  });

  it('ranks name prefixes before matches inside a name', () => {
    expect(filterPokemonBySearch(pokemon, 'en').map((p) => p.nameGerman)).toEqual(['Enton']);
    expect(filterPokemonBySearch(pokemon, 'sa').map((p) => p.nameGerman)).toEqual([
      'Safcon',
      'Bisasam',
    ]);
  });

  it('finds the exact Pokédex number first', () => {
    expect(filterPokemonBySearch(pokemon, '1')[0].nameGerman).toBe('Bisasam');
    expect(filterPokemonBySearch(pokemon, '151').map((p) => p.nameGerman)).toEqual(['Mew']);
  });

  it('ignores surrounding spaces and case, and respects the limit', () => {
    expect(filterPokemonBySearch(pokemon, ' MEW ', 1).map((p) => p.nameGerman)).toEqual(['Mew']);
    expect(filterPokemonBySearch(pokemon, '   ')).toEqual([]);
  });
});

describe('getOpenCaptureRoutes', () => {
  const encounter = (playerId: number, status: { isKnockedOut?: boolean; isNotCaught?: boolean } = {}) => ({
    player: { id: playerId },
    isKnockedOut: false,
    isNotCaught: false,
    ...status,
  });
  const routes = [
    { id: 1, encounters: [encounter(1), encounter(2)] },
    { id: 2, encounters: [encounter(1)] },
    { id: 3, encounters: [] },
    { id: 4, encounters: [encounter(1, { isNotCaught: true })] },
    { id: 5, encounters: [encounter(2, { isKnockedOut: true })] },
  ];

  it('keeps unfinished active routes in game order', () => {
    expect(getOpenCaptureRoutes(routes, [1, 2]).map((route) => route.id)).toEqual([2, 3]);
  });

  it('returns nothing without players', () => {
    expect(getOpenCaptureRoutes(routes, [])).toEqual([]);
  });
});
