import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheFindUnique: vi.fn(),
  cacheUpsert: vi.fn(),
  pokemonFindMany: vi.fn(),
  runFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    pokemonEditionDetailCache: {
      findUnique: mocks.cacheFindUnique,
      upsert: mocks.cacheUpsert,
    },
    pokemon: { findMany: mocks.pokemonFindMany },
    run: { findFirst: mocks.runFindFirst },
  },
}));

import {
  formatEvolutionCondition,
  getPokemonDetails,
  selectLevelUpMoveEntries,
} from '@/lib/pokemon-details.server';

const pokemonResponse = {
  id: 25,
  name: 'pikachu',
  types: [{ slot: 1, type: { name: 'electric', url: '/type/13/' } }],
  stats: [
    { base_stat: 35, stat: { name: 'hp', url: '' } },
    { base_stat: 55, stat: { name: 'attack', url: '' } },
    { base_stat: 40, stat: { name: 'defense', url: '' } },
    { base_stat: 50, stat: { name: 'special-attack', url: '' } },
    { base_stat: 50, stat: { name: 'special-defense', url: '' } },
    { base_stat: 90, stat: { name: 'speed', url: '' } },
  ],
  moves: [
    {
      move: { name: 'thunder-shock', url: 'https://pokeapi.co/api/v2/move/84/' },
      version_group_details: [
        { level_learned_at: 5, order: 2, move_learn_method: { name: 'level-up', url: '' }, version_group: { name: 'black-white', url: '' } },
        { level_learned_at: 1, order: 1, move_learn_method: { name: 'level-up', url: '' }, version_group: { name: 'black-2-white-2', url: '' } },
      ],
    },
    {
      move: { name: 'growl', url: 'https://pokeapi.co/api/v2/move/45/' },
      version_group_details: [
        { level_learned_at: 1, order: 0, move_learn_method: { name: 'machine', url: '' }, version_group: { name: 'black-2-white-2', url: '' } },
      ],
    },
  ],
  sprites: { front_default: '/pikachu.png', other: { showdown: { front_default: '/pikachu.gif' } } },
};

const speciesResponse = {
  generation: { name: 'generation-i', url: 'https://pokeapi.co/api/v2/generation/1/' },
  names: [
    { name: 'Pikachu', language: { name: 'de', url: '' } },
    { name: 'Pikachu', language: { name: 'en', url: '' } },
  ],
  evolution_chain: null,
};

const moveResponse = {
  name: 'thunder-shock',
  names: [{ name: 'Donnerschock', language: { name: 'de', url: '' } }],
  type: { name: 'electric', url: '' },
  damage_class: { name: 'special', url: '' },
  power: 40,
  accuracy: 100,
  pp: 30,
};

function freshFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/pokemon-species/25')) return new Response(JSON.stringify(speciesResponse));
    if (url.includes('/pokemon/25')) return new Response(JSON.stringify(pokemonResponse));
    if (url.includes('/move/84')) return new Response(JSON.stringify(moveResponse));
    throw new Error(`Unexpected URL ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cacheFindUnique.mockResolvedValue(null);
  mocks.cacheUpsert.mockResolvedValue({});
  mocks.pokemonFindMany.mockResolvedValue([]);
  mocks.runFindFirst.mockResolvedValue(null);
  vi.stubGlobal('fetch', freshFetchMock());
});

describe('edition-specific level-up moves', () => {
  it('keeps only level-up moves from the exact version group and sorts them', () => {
    const entries = selectLevelUpMoveEntries(
      pokemonResponse as never,
      'black-2-white-2',
    );
    expect(entries).toEqual([
      { move: pokemonResponse.moves[0].move, level: 1, order: 1 },
    ]);
  });

  it('does not request or invent moves when no edition is assigned', async () => {
    const result = await getPokemonDetails(25);

    expect(result.edition).toBeNull();
    expect(result.levelUpMoves).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/move/'),
      expect.anything(),
    );
    expect(mocks.cacheUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pokedexId_versionGroupSlug: {
            pokedexId: 25,
            versionGroupSlug: '__no-edition__',
          },
        },
      }),
    );
  });

  it('loads only level-up moves for the selected edition and persists the payload', async () => {
    const result = await getPokemonDetails(25, { gameVersionKey: 'black2' });

    expect(result.edition?.key).toBe('black2');
    expect(result.levelUpMoves).toEqual([
      expect.objectContaining({ name: 'thunder-shock', displayName: 'Donnerschock', level: 1 }),
    ]);
    expect(result.pokemon.stats.total).toBe(320);
    expect(result.cache.status).toBe('miss');
    expect(mocks.cacheUpsert).toHaveBeenCalledTimes(1);
  });

  it('fetches historical boundaries and caches Charm as Normal for Black 2', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/pokemon-species/25')) return new Response(JSON.stringify(speciesResponse));
      if (url.includes('/pokemon/25')) return new Response(JSON.stringify({
        ...pokemonResponse,
        moves: [{ ...pokemonResponse.moves[0], move: { name: 'charm', url: 'https://pokeapi.co/api/v2/move/204/' } }],
      }));
      if (url.includes('/move/204')) return new Response(JSON.stringify({
        ...moveResponse,
        name: 'charm', names: [{ name: 'Charme', language: { name: 'de', url: '' } }],
        type: { name: 'fairy', url: '' }, damage_class: { name: 'status', url: '' }, power: null,
        past_values: [{ type: { name: 'normal', url: '' }, power: null, accuracy: null, pp: null, version_group: { name: 'x-y', url: '' } }],
      }));
      if (url.includes('/version-group/x-y')) return new Response(JSON.stringify({ order: 17 }));
      if (url.includes('/version-group/black-2-white-2')) return new Response(JSON.stringify({ order: 16 }));
      throw new Error(`Unexpected URL ${url}`);
    }));
    const result = await getPokemonDetails(25, { gameVersionKey: 'black2' });
    expect(result.levelUpMoves?.[0]).toMatchObject({ displayName: 'Charme', type: 'normal', damageClass: 'status' });
    expect(mocks.cacheUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ schemaVersion: 3 }),
    }));
  });
});

describe('persistent detail cache', () => {
  const cachedPayload = {
    pokemon: {
      pokedexId: 25,
      name: 'pikachu',
      nameGerman: 'Pikachu',
      displayName: 'Pikachu',
      types: ['electric'],
      spriteUrl: null,
      spriteGifUrl: null,
      stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90, total: 320 },
    },
    edition: { key: 'black2', name: 'Pokémon Schwarz 2', versionSlug: 'black-2', versionGroupSlug: 'black-2-white-2' },
    levelUpMoves: [],
    evolution: { nodes: [], edges: [] },
  };

  it('returns a fresh cache hit without PokeAPI calls', async () => {
    mocks.cacheFindUnique.mockResolvedValue({
      payload: JSON.stringify(cachedPayload),
      schemaVersion: 3,
      fetchedAt: new Date('2026-08-20T00:00:00Z'),
      expiresAt: new Date('2026-09-20T00:00:00Z'),
    });

    const result = await getPokemonDetails(25, {
      gameVersionKey: 'black2',
      now: new Date('2026-08-30T00:00:00Z'),
    });

    expect(result.cache.status).toBe('hit');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.cacheUpsert).not.toHaveBeenCalled();
  });

  it('keeps the requested edition label when sibling editions share the cache', async () => {
    mocks.cacheFindUnique.mockResolvedValue({
      payload: JSON.stringify(cachedPayload),
      schemaVersion: 3,
      fetchedAt: new Date('2026-08-20T00:00:00Z'),
      expiresAt: new Date('2026-09-20T00:00:00Z'),
    });
    const result = await getPokemonDetails(25, {
      gameVersionKey: 'white2',
      now: new Date('2026-08-30T00:00:00Z'),
    });
    expect(result.edition?.key).toBe('white2');
    expect(result.edition?.name).toBe('Pokémon Weiß 2');
    expect(result.cache.status).toBe('hit');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes old-schema data before exposing modern move values for an older edition', async () => {
    mocks.cacheFindUnique.mockResolvedValue({
      payload: JSON.stringify(cachedPayload),
      schemaVersion: 2,
      fetchedAt: new Date('2026-08-20T00:00:00Z'),
      expiresAt: new Date('2026-09-20T00:00:00Z'),
    });
    const result = await getPokemonDetails(25, {
      gameVersionKey: 'black2',
      now: new Date('2026-08-30T00:00:00Z'),
    });
    expect(result.cache.status).toBe('miss');
    expect(result.evolution.editionScope?.generation).toBe(5);
    expect(mocks.cacheUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ schemaVersion: 3 }),
    }));
  });

  it('falls back to stale persisted data when PokeAPI is unavailable', async () => {
    mocks.cacheFindUnique.mockResolvedValue({
      payload: JSON.stringify(cachedPayload),
      schemaVersion: 3,
      fetchedAt: new Date('2026-06-01T00:00:00Z'),
      expiresAt: new Date('2026-07-01T00:00:00Z'),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await getPokemonDetails(25, {
      gameVersionKey: 'black2',
      now: new Date('2026-08-30T00:00:00Z'),
    });

    expect(result.cache).toMatchObject({ status: 'stale', stale: true });
    expect(result.pokemon.displayName).toBe('Pikachu');
  });
});

describe('evolution conditions', () => {
  it('formats level, time and friendship requirements in German', () => {
    const result = formatEvolutionCondition({
      trigger: { name: 'level-up', url: '' },
      item: null,
      held_item: null,
      known_move: null,
      known_move_type: null,
      location: null,
      min_level: 30,
      min_happiness: 220,
      min_beauty: null,
      min_affection: null,
      time_of_day: 'night',
      gender: null,
      relative_physical_stats: null,
      needs_overworld_rain: false,
      turn_upside_down: false,
      party_species: null,
      party_type: null,
      trade_species: null,
    });

    expect(result.label).toBe('Level 30 · Freundschaft 220+ · nachts');
    expect(result).toMatchObject({ minLevel: 30, minHappiness: 220, timeOfDay: 'night' });
  });

  it('reads form restrictions from the PokeAPI form fields', () => {
    const result = formatEvolutionCondition({
      trigger: { name: 'level-up', url: '' },
      required_pokemon_form: { name: 'zigzagoon-galar', url: 'https://pokeapi.co/api/v2/pokemon-form/10333/' },
      evolved_pokemon_form: { name: 'linoone-galar', url: 'https://pokeapi.co/api/v2/pokemon-form/10334/' },
      item: null,
      held_item: null,
      known_move: null,
      known_move_type: null,
      location: null,
      min_level: 20,
      min_happiness: null,
      min_beauty: null,
      min_affection: null,
      time_of_day: '',
      gender: null,
      relative_physical_stats: null,
      needs_overworld_rain: false,
      turn_upside_down: false,
      party_species: null,
      party_type: null,
      trade_species: null,
    });

    expect(result).toMatchObject({ basePokedexId: 10333, evolvedPokedexId: 10334 });
  });
});
