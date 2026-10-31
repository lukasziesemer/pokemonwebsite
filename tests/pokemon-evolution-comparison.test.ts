import { describe, expect, it } from 'vitest';
import { buildEvolutionForest, evolutionAddState, scopeEvolutionToEdition } from '@/lib/pokemon-evolution-comparison';
import type { EvolutionCondition, EvolutionNode, PokemonEvolutionDetails } from '@/lib/pokemon-details';

const node = (pokedexId: number, generation: number): EvolutionNode => ({
  pokedexId, generation, name: `pokemon-${pokedexId}`, nameGerman: null,
  displayName: `Pokémon ${pokedexId}`, spriteUrl: null, spriteGifUrl: null,
});
const orders = { 'red-blue': 1, 'gold-silver': 3, 'diamond-pearl': 8, 'black-white': 11, 'black-2-white-2': 14, 'x-y': 15, 'sword-shield': 20 };
const condition = (introducedVersionGroup: string, label: string, extra: Partial<EvolutionCondition> = {}): EvolutionCondition => ({ trigger: 'level-up', label, introducedVersionGroup, ...extra });
const eevee: PokemonEvolutionDetails = {
  nodes: [node(133, 1), node(134, 1), node(135, 1), node(470, 4), node(700, 6)],
  edges: [
    { fromPokedexId: 133, toPokedexId: 134, conditions: [condition('red-blue', 'Mit Wasserstein', { trigger: 'use-item' })] },
    { fromPokedexId: 133, toPokedexId: 135, conditions: [condition('red-blue', 'Mit Donnerstein', { trigger: 'use-item' })] },
    { fromPokedexId: 133, toPokedexId: 470, conditions: [
      condition('diamond-pearl', 'Levelaufstieg · bei Ewigwald', { location: 'eterna-forest' }),
      condition('black-white', 'Levelaufstieg · bei Ewigenwald', { location: 'pinwheel-forest' }),
      condition('sword-shield', 'Mit Blattstein', { item: 'leaf-stone', trigger: 'use-item' }),
    ] },
    { fromPokedexId: 133, toPokedexId: 700, conditions: [condition('x-y', 'Zutrauen')] },
  ],
};

describe('edition-aware evolution comparison', () => {
  it('hides later-generation branches and rejects later methods in Schwarz 2', () => {
    const scoped = scopeEvolutionToEdition(eevee, 133, 'black2', orders);
    expect(scoped.nodes.map(entry => entry.pokedexId)).toEqual([133, 134, 135, 470]);
    expect(scoped.edges.find(edge => edge.toPokedexId === 470)?.conditions.map(entry => entry.label)).toEqual(['Levelaufstieg · bei Ewigenwald']);
    expect(scoped.editionScope).toMatchObject({ generation: 5, excludedPokemonCount: 1, conditionsVerified: false });
  });

  it('uses the newer stone method in Schwert instead of accumulating obsolete locations', () => {
    const scoped = scopeEvolutionToEdition(eevee, 133, 'sword', orders);
    expect(scoped.edges.find(edge => edge.toPokedexId === 470)?.conditions.map(entry => entry.label)).toEqual(['Mit Blattstein']);
  });

  it('does not claim a location in another region is usable', () => {
    const scoped = scopeEvolutionToEdition(eevee, 133, 'heartgold', { ...orders, 'heartgold-soulsilver': 10 });
    expect(scoped.edges.find(edge => edge.toPokedexId === 470)?.conditions).toEqual([{ trigger: 'unknown', label: 'Bedingung für diese Edition nicht bestätigt' }]);
  });

  it('removes regional-form-only branches from a default species chain', () => {
    const family: PokemonEvolutionDetails = {
      nodes: [node(263, 3), node(264, 3), node(862, 8)],
      edges: [
        { fromPokedexId: 263, toPokedexId: 264, conditions: [condition('red-blue', 'Level 20')] },
        { fromPokedexId: 264, toPokedexId: 862, conditions: [condition('sword-shield', 'Level 35', { basePokedexId: 10175 })] },
      ],
    };
    const scoped = scopeEvolutionToEdition(family, 264, 'sword', orders);
    expect(scoped.nodes.map(entry => entry.pokedexId)).toEqual([263, 264]);
  });

  it('does not invent an edge around a later-added baby species', () => {
    const family: PokemonEvolutionDetails = {
      nodes: [node(172, 2), node(25, 1), node(26, 1)],
      edges: [
        { fromPokedexId: 172, toPokedexId: 25, conditions: [condition('gold-silver', 'Freundschaft 160+')] },
        { fromPokedexId: 25, toPokedexId: 26, conditions: [condition('red-blue', 'Mit Donnerstein')] },
      ],
    };
    const scoped = scopeEvolutionToEdition(family, 25, 'red', orders);
    expect(scoped.nodes.map(entry => entry.pokedexId)).toEqual([25, 26]);
    expect(buildEvolutionForest(scoped)[0].pokemon.pokedexId).toBe(25);
  });

  it('retains explicit branches instead of implying a chain between siblings', () => {
    const forest = buildEvolutionForest(eevee);
    expect(forest).toHaveLength(1);
    expect(forest[0].children.map(child => child.pokemon.pokedexId)).toEqual([134, 135, 470, 700]);
    expect(forest[0].children.every(child => child.children.length === 0)).toBe(true);
  });

  it('labels general evolution data honestly without an edition', () => {
    const scoped = scopeEvolutionToEdition(eevee, 133, null, {});
    expect(scoped.nodes).toEqual(eevee.nodes);
    expect(scoped.editionScope?.note).toContain('Keine Edition');
  });

  it('keeps coexistable historical methods instead of replacing the older method', () => {
    const family: PokemonEvolutionDetails = {
      nodes: [node(349, 3), node(350, 3)],
      edges: [{ fromPokedexId: 349, toPokedexId: 350, conditions: [
        condition('ruby-sapphire', 'Levelaufstieg · Schönheit 170+', { minBeauty: 170 }),
        condition('black-white', 'Tausch · hält Schönschuppe', { trigger: 'trade', heldItem: 'prism-scale' }),
      ] }],
    };
    const scoped = scopeEvolutionToEdition(family, 349, 'omegaruby', {
      ...orders, 'ruby-sapphire': 5, 'omega-ruby-alpha-sapphire': 16,
    });
    expect(scoped.edges[0].conditions).toHaveLength(2);
    expect(scoped.editionScope?.conditionsVerified).toBe(false);
  });

  it('suppresses uncertain methods if supplemental version metadata is unavailable', () => {
    const scoped = scopeEvolutionToEdition(eevee, 133, 'black2', {});
    expect(scoped.nodes.map(entry => entry.pokedexId)).toEqual([133, 134, 135, 470]);
    expect(scoped.edges.every(edge => edge.conditions.every(entry => entry.trigger === 'unknown'))).toBe(true);
  });
});

describe('adding evolution species to the comparison', () => {
  const available = new Set([1, 2, 3, 4, 5, 6, 7]);
  it('allows additions without changing the current selection', () => {
    const selection = [1, 2];
    expect(evolutionAddState(3, selection, available).disabled).toBe(false);
    expect(selection).toEqual([1, 2]);
  });
  it('explains full, duplicate and unavailable states', () => {
    expect(evolutionAddState(7, [1, 2, 3, 4, 5, 6], available)).toMatchObject({ disabled: true, label: 'Vergleich voll' });
    expect(evolutionAddState(1, [1, 2], available)).toMatchObject({ disabled: true, label: 'Im Vergleich' });
    expect(evolutionAddState(999, [1, 2], available)).toMatchObject({ disabled: true, label: 'Nicht verfügbar' });
  });
});
