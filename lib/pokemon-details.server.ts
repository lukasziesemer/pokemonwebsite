import type {
  EvolutionCondition,
  EvolutionEdge,
  EvolutionNode,
  LevelUpMove,
  PokemonDetailsResponse,
  PokemonDetailsSummary,
  PokemonEditionInfo,
  PokemonEvolutionDetails,
} from './pokemon-details';
import { getCurrentGameVersion } from './current-game';
import { getKnownGameVersion } from './game-versions';
import { scopeEvolutionToEdition } from './pokemon-evolution-comparison';
import { resolveMoveMetadata, type PokeApiMoveMetadata } from './pokemon-move-metadata';
import prisma from './prisma';

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2';
const CACHE_SCHEMA_VERSION = 3;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NO_EDITION_CACHE_KEY = '__no-edition__';

interface NamedResource {
  name: string;
  url: string;
}

interface PokeApiPokemon {
  id: number;
  name: string;
  types: Array<{ slot: number; type: NamedResource }>;
  stats: Array<{ base_stat: number; stat: NamedResource }>;
  moves: Array<{
    move: NamedResource;
    version_group_details: Array<{
      level_learned_at: number;
      order: number | null;
      move_learn_method: NamedResource;
      version_group: NamedResource;
    }>;
  }>;
  sprites: {
    front_default: string | null;
    other?: {
      'official-artwork'?: { front_default?: string | null };
      showdown?: { front_default?: string | null };
    };
  };
}

interface PokeApiSpecies {
  names: Array<{ name: string; language: NamedResource }>;
  evolution_chain: { url: string } | null;
  generation?: NamedResource;
}

interface PokeApiMove extends PokeApiMoveMetadata {
  names: Array<{ name: string; language: NamedResource }>;
}

interface PokeApiEvolutionDetail {
  version_group?: NamedResource | null;
  base_form?: NamedResource | null;
  evolved_form?: NamedResource | null;
  near_special_rock?: boolean;
  needs_multiplayer?: boolean;
  used_move?: NamedResource | null;
  min_move_count?: number | null;
  min_steps?: number | null;
  min_damage_taken?: number | null;
  trigger: NamedResource;
  item: NamedResource | null;
  held_item: NamedResource | null;
  known_move: NamedResource | null;
  known_move_type: NamedResource | null;
  location: NamedResource | null;
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  time_of_day: string;
  gender: number | null;
  relative_physical_stats: number | null;
  needs_overworld_rain: boolean;
  turn_upside_down: boolean;
  party_species: NamedResource | null;
  party_type: NamedResource | null;
  trade_species: NamedResource | null;
}

interface PokeApiEvolutionLink {
  species: NamedResource;
  evolution_details: PokeApiEvolutionDetail[];
  evolves_to: PokeApiEvolutionLink[];
}

interface PokeApiEvolutionChain {
  chain: PokeApiEvolutionLink;
}

interface CachedPokemonDetailsPayload {
  pokemon: PokemonDetailsSummary;
  edition: PokemonEditionInfo | null;
  levelUpMoves: LevelUpMove[] | null;
  evolution: PokemonEvolutionDetails;
}

export interface ResolvePokemonDetailsOptions {
  gameVersionKey?: string | null;
  now?: Date;
}

const inFlightPokeApiRequests = new Map<string, Promise<unknown>>();
const inFlightDetailRequests = new Map<string, Promise<CachedPokemonDetailsPayload>>();

class PokeApiError extends Error {
  constructor(readonly status: number, resource: string) {
    super(`PokeAPI ${resource} konnte nicht geladen werden (${status}).`);
    this.name = 'PokeApiError';
  }
}

async function fetchPokeApi<T>(resourceOrUrl: string): Promise<T> {
  const url = resourceOrUrl.startsWith('http')
    ? resourceOrUrl
    : `${POKEAPI_BASE_URL}/${resourceOrUrl.replace(/^\//, '')}`;
  const existing = inFlightPokeApiRequests.get(url);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new PokeApiError(response.status, resourceOrUrl);
    return response.json() as Promise<T>;
  })();

  inFlightPokeApiRequests.set(url, request);
  try {
    return await request;
  } finally {
    inFlightPokeApiRequests.delete(url);
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return result;
}

function extractId(resource: NamedResource): number {
  const match = resource.url.match(/\/(\d+)\/?$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function germanName(names: PokeApiSpecies['names'] | PokeApiMove['names']): string | null {
  return names.find((entry) => entry.language.name === 'de')?.name ?? null;
}

function slugLabel(value: string): string {
  const itemNames: Record<string, string> = {
    'water-stone': 'Wasserstein', 'fire-stone': 'Feuerstein', 'thunder-stone': 'Donnerstein',
    'leaf-stone': 'Blattstein', 'ice-stone': 'Eisstein', 'moon-stone': 'Mondstein',
    'sun-stone': 'Sonnenstein', 'shiny-stone': 'Leuchtstein', 'dusk-stone': 'Finsterstein',
    'dawn-stone': 'Funkelstein', 'linking-cord': 'Verbindungsschnur',
  };
  if (itemNames[value]) return itemNames[value];
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function stat(data: PokeApiPokemon, name: string): number {
  return data.stats.find((entry) => entry.stat.name === name)?.base_stat ?? 0;
}

export function buildPokemonSummary(
  data: PokeApiPokemon,
  nameGerman: string | null,
): PokemonDetailsSummary {
  const stats = {
    hp: stat(data, 'hp'),
    attack: stat(data, 'attack'),
    defense: stat(data, 'defense'),
    spAttack: stat(data, 'special-attack'),
    spDefense: stat(data, 'special-defense'),
    speed: stat(data, 'speed'),
  };
  return {
    pokedexId: data.id,
    name: data.name,
    nameGerman,
    displayName: nameGerman ?? slugLabel(data.name),
    types: [...data.types]
      .sort((left, right) => left.slot - right.slot)
      .map((entry) => entry.type.name),
    spriteUrl: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default,
    spriteGifUrl: data.sprites.other?.showdown?.front_default ?? null,
    stats: { ...stats, total: Object.values(stats).reduce((sum, value) => sum + value, 0) },
  };
}

export function selectLevelUpMoveEntries(
  pokemon: PokeApiPokemon,
  versionGroupSlug: string,
): Array<{ move: NamedResource; level: number; order: number }> {
  return pokemon.moves
    .flatMap(({ move, version_group_details: details }) =>
      details
        .filter(
          (detail) =>
            detail.version_group.name === versionGroupSlug &&
            detail.move_learn_method.name === 'level-up',
        )
        .map((detail) => ({
          move,
          level: detail.level_learned_at,
          order: detail.order ?? Number.MAX_SAFE_INTEGER,
        })),
    )
    .sort(
      (left, right) =>
        left.level - right.level || left.order - right.order || left.move.name.localeCompare(right.move.name),
    );
}

async function buildLevelUpMoves(
  pokemon: PokeApiPokemon,
  edition: PokemonEditionInfo,
): Promise<LevelUpMove[]> {
  const entries = selectLevelUpMoveEntries(pokemon, edition.versionGroupSlug);
  const resources = [...new Map(entries.map((entry) => [entry.move.name, entry.move])).values()];
  const details = await mapWithConcurrency(resources, 6, (move) =>
    fetchPokeApi<PokeApiMove>(move.url),
  );
  const detailByName = new Map(details.map((move) => [move.name, move]));
  const historyGroups = new Set(details.flatMap(move => (
    move.past_values?.map(change => change.version_group.name) ?? []
  )));
  if (historyGroups.size > 0) historyGroups.add(edition.versionGroupSlug);
  const groupOrders = Object.fromEntries(await mapWithConcurrency([...historyGroups], 4, async slug => {
    const group = await fetchPokeApi<{ order: number }>(`version-group/${slug}`);
    return [slug, group.order] as const;
  }));
  const generation = getKnownGameVersion(edition.key)?.generation;
  if (!generation) throw new Error('Generation für editionsspezifische Attacken fehlt.');

  return entries.map((entry) => {
    const move = detailByName.get(entry.move.name);
    if (!move) throw new Error(`PokeAPI-Attackendetails fehlen: ${entry.move.name}`);
    const nameGerman = germanName(move.names);
    return {
      name: move.name,
      nameGerman,
      displayName: nameGerman ?? slugLabel(move.name),
      level: entry.level,
      order: entry.order,
      ...resolveMoveMetadata(move, { versionGroupSlug: edition.versionGroupSlug, generation }, groupOrders),
    };
  });
}

export function formatEvolutionCondition(detail: PokeApiEvolutionDetail): EvolutionCondition {
  const trigger = detail.trigger.name;
  const parts: string[] = [];
  const item = detail.item?.name;
  const heldItem = detail.held_item?.name;
  const knownMove = detail.known_move?.name;
  const knownMoveType = detail.known_move_type?.name;
  const location = detail.location?.name;
  const partySpecies = detail.party_species?.name;
  const partyType = detail.party_type?.name;
  const tradeSpecies = detail.trade_species?.name;

  if (trigger === 'trade') parts.push(tradeSpecies ? `Tausch gegen ${slugLabel(tradeSpecies)}` : 'Tausch');
  else if (trigger === 'use-item') parts.push(item ? `Mit ${slugLabel(item)}` : 'Item verwenden');
  else if (trigger === 'shed') parts.push('Freier Teamplatz und Pokéball');
  else if (trigger === 'level-up') parts.push(detail.min_level !== null ? `Level ${detail.min_level}` : 'Levelaufstieg');
  else parts.push(`Sonderbedingung: ${slugLabel(trigger)}`);

  if (item && trigger !== 'use-item') parts.push(`mit ${slugLabel(item)}`);
  if (heldItem) parts.push(`hält ${slugLabel(heldItem)}`);
  if (knownMove) parts.push(`kennt ${slugLabel(knownMove)}`);
  if (knownMoveType) parts.push(`kennt Attacke vom Typ ${slugLabel(knownMoveType)}`);
  if (location) parts.push(`bei ${slugLabel(location)}`);
  if (detail.near_special_rock) parts.push('am besonderen Felsen');
  if (detail.needs_multiplayer) parts.push('im Mehrspielermodus');
  if (detail.used_move) parts.push(`${slugLabel(detail.used_move.name)} einsetzen${detail.min_move_count ? ` (${detail.min_move_count}×)` : ''}`);
  if (detail.min_steps) parts.push(`${detail.min_steps} Schritte`);
  if (detail.min_damage_taken) parts.push(`${detail.min_damage_taken} Schaden erleiden`);
  if (detail.min_happiness !== null) parts.push(`Freundschaft ${detail.min_happiness}+`);
  if (detail.min_beauty !== null) parts.push(`Schönheit ${detail.min_beauty}+`);
  if (detail.min_affection !== null) parts.push(`Zutrauen ${detail.min_affection}+`);
  if (detail.time_of_day) parts.push(detail.time_of_day === 'day' ? 'tagsüber' : detail.time_of_day === 'night' ? 'nachts' : slugLabel(detail.time_of_day));
  if (detail.gender !== null) parts.push(detail.gender === 1 ? 'weiblich' : detail.gender === 2 ? 'männlich' : `Geschlecht ${detail.gender}`);
  if (detail.relative_physical_stats !== null) {
    parts.push(detail.relative_physical_stats === 1 ? 'Angriff > Verteidigung' : detail.relative_physical_stats === -1 ? 'Angriff < Verteidigung' : 'Angriff = Verteidigung');
  }
  if (detail.needs_overworld_rain) parts.push('bei Regen');
  if (detail.turn_upside_down) parts.push('Konsole umdrehen');
  if (partySpecies) parts.push(`${slugLabel(partySpecies)} im Team`);
  if (partyType) parts.push(`Typ ${slugLabel(partyType)} im Team`);

  return {
    trigger,
    label: parts.join(' · '),
    ...(detail.min_level !== null ? { minLevel: detail.min_level } : {}),
    ...(item ? { item } : {}),
    ...(heldItem ? { heldItem } : {}),
    ...(knownMove ? { knownMove } : {}),
    ...(knownMoveType ? { knownMoveType } : {}),
    ...(location ? { location } : {}),
    ...(detail.min_happiness !== null ? { minHappiness: detail.min_happiness } : {}),
    ...(detail.min_beauty !== null ? { minBeauty: detail.min_beauty } : {}),
    ...(detail.min_affection !== null ? { minAffection: detail.min_affection } : {}),
    ...(detail.time_of_day ? { timeOfDay: detail.time_of_day } : {}),
    ...(detail.gender !== null ? { gender: String(detail.gender) } : {}),
    ...(detail.relative_physical_stats !== null ? { relativePhysicalStats: detail.relative_physical_stats } : {}),
    ...(detail.needs_overworld_rain ? { needsOverworldRain: true } : {}),
    ...(detail.turn_upside_down ? { turnUpsideDown: true } : {}),
    ...(partySpecies ? { partySpecies } : {}),
    ...(partyType ? { partyType } : {}),
    ...(tradeSpecies ? { tradeSpecies } : {}),
    ...(detail.version_group ? { introducedVersionGroup: detail.version_group.name } : {}),
    ...(detail.base_form ? { basePokedexId: extractId(detail.base_form) } : {}),
    ...(detail.evolved_form ? { evolvedPokedexId: extractId(detail.evolved_form) } : {}),
  };
}

function collectEvolutionGraph(
  link: PokeApiEvolutionLink,
  nodes: number[],
  edges: EvolutionEdge[],
  parentId: number | null = null,
): void {
  const id = extractId(link.species);
  if (id > 0 && !nodes.includes(id)) nodes.push(id);
  if (parentId !== null && id > 0) {
    edges.push({
      fromPokedexId: parentId,
      toPokedexId: id,
      conditions: link.evolution_details.length > 0
        ? link.evolution_details.map(formatEvolutionCondition)
        : [{ trigger: 'unknown', label: 'Bedingung nicht verfügbar' }],
    });
  }
  for (const child of link.evolves_to) collectEvolutionGraph(child, nodes, edges, id);
}

async function buildEvolutionDetails(
  currentPokemon: PokeApiPokemon,
  currentSpecies: PokeApiSpecies,
  edition: PokemonEditionInfo | null,
): Promise<PokemonEvolutionDetails> {
  if (!currentSpecies.evolution_chain?.url) {
    return scopeEvolutionToEdition({
      nodes: [{
        pokedexId: currentPokemon.id,
        name: currentPokemon.name,
        nameGerman: germanName(currentSpecies.names),
        displayName: germanName(currentSpecies.names) ?? slugLabel(currentPokemon.name),
        spriteUrl: currentPokemon.sprites.other?.['official-artwork']?.front_default ?? currentPokemon.sprites.front_default,
        spriteGifUrl: currentPokemon.sprites.other?.showdown?.front_default ?? null,
        generation: currentSpecies.generation ? extractId(currentSpecies.generation) : undefined,
      }],
      edges: [],
    }, currentPokemon.id, edition?.key ?? null, {});
  }

  const chain = await fetchPokeApi<PokeApiEvolutionChain>(currentSpecies.evolution_chain.url);
  const ids: number[] = [];
  const edges: EvolutionEdge[] = [];
  collectEvolutionGraph(chain.chain, ids, edges);

  const groups = [...new Set([
    ...(edition ? [edition.versionGroupSlug] : []),
    ...edges.flatMap(edge => edge.conditions.flatMap(condition => condition.introducedVersionGroup ? [condition.introducedVersionGroup] : [])),
  ])];
  const loadGroupOrders = () => edition
    ? mapWithConcurrency(groups, 4, async slug => {
        try {
          const group = await fetchPokeApi<{ order: number }>(`version-group/${slug}`);
          return [slug, group.order] as const;
        } catch {
          // Version metadata is supplemental. Missing order suppresses uncertain
          // methods below instead of taking down stats and the move list too.
          return [slug, undefined] as const;
        }
      })
    : Promise.resolve([]);

  const localPokemon = await prisma.pokemon.findMany({
    where: { pokedexId: { in: ids } },
    select: {
      pokedexId: true,
      name: true,
      nameGerman: true,
      spriteUrl: true,
      spriteGifUrl: true,
    },
  });
  const localById = new Map(localPokemon.map((pokemon) => [pokemon.pokedexId, pokemon]));

  const [nodes, groupOrderEntries] = await Promise.all([mapWithConcurrency(ids, 4, async (pokedexId): Promise<EvolutionNode> => {
    const species = pokedexId === currentPokemon.id
      ? currentSpecies
      : await fetchPokeApi<PokeApiSpecies>(`pokemon-species/${pokedexId}`);
    const generation = species.generation ? extractId(species.generation) : undefined;
    const local = localById.get(pokedexId);
    if (local) {
      return {
        ...local,
        displayName: local.nameGerman ?? slugLabel(local.name),
        generation,
      };
    }
    if (pokedexId === currentPokemon.id) {
      const nameGerman = germanName(currentSpecies.names);
      return {
        pokedexId,
        name: currentPokemon.name,
        nameGerman,
        displayName: nameGerman ?? slugLabel(currentPokemon.name),
        spriteUrl: currentPokemon.sprites.other?.['official-artwork']?.front_default ?? currentPokemon.sprites.front_default,
        spriteGifUrl: currentPokemon.sprites.other?.showdown?.front_default ?? null,
        generation,
      };
    }
    const pokemon = await fetchPokeApi<PokeApiPokemon>(`pokemon/${pokedexId}`);
    const nameGerman = germanName(species.names);
    return {
      pokedexId,
      name: pokemon.name,
      nameGerman,
      displayName: nameGerman ?? slugLabel(pokemon.name),
      spriteUrl: pokemon.sprites.other?.['official-artwork']?.front_default ?? pokemon.sprites.front_default,
      spriteGifUrl: pokemon.sprites.other?.showdown?.front_default ?? null,
      generation,
    };
  }), loadGroupOrders()]);

  const groupOrders = Object.fromEntries(groupOrderEntries.filter((entry): entry is readonly [string, number] => entry[1] !== undefined));
  return scopeEvolutionToEdition({ nodes, edges }, currentPokemon.id, edition?.key ?? null, groupOrders);
}

async function resolveEdition(gameVersionKey?: string | null): Promise<PokemonEditionInfo | null> {
  if (gameVersionKey === null) return null;
  const explicit = getKnownGameVersion(gameVersionKey);
  if (gameVersionKey) return explicit;
  const current = await getCurrentGameVersion();
  if (!current) return null;
  return {
    key: current.key,
    name: current.name,
    versionSlug: current.versionSlug,
    versionGroupSlug: current.versionGroupSlug,
  };
}

async function fetchFreshPayload(
  pokedexId: number,
  edition: PokemonEditionInfo | null,
): Promise<CachedPokemonDetailsPayload> {
  const [pokemon, species] = await Promise.all([
    fetchPokeApi<PokeApiPokemon>(`pokemon/${pokedexId}`),
    fetchPokeApi<PokeApiSpecies>(`pokemon-species/${pokedexId}`),
  ]);
  const [levelUpMoves, evolution] = await Promise.all([
    edition ? buildLevelUpMoves(pokemon, edition) : Promise.resolve(null),
    buildEvolutionDetails(pokemon, species, edition),
  ]);
  return {
    pokemon: buildPokemonSummary(pokemon, germanName(species.names)),
    edition,
    levelUpMoves,
    evolution,
  };
}

function parseCachedPayload(payload: string): CachedPokemonDetailsPayload | null {
  try {
    return JSON.parse(payload) as CachedPokemonDetailsPayload;
  } catch {
    return null;
  }
}

async function refreshAndPersist(
  pokedexId: number,
  edition: PokemonEditionInfo | null,
  versionGroupSlug: string,
  now: Date,
): Promise<CachedPokemonDetailsPayload> {
  const key = `${pokedexId}:${versionGroupSlug}`;
  const existing = inFlightDetailRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const payload = await fetchFreshPayload(pokedexId, edition);
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
    await prisma.pokemonEditionDetailCache.upsert({
      where: { pokedexId_versionGroupSlug: { pokedexId, versionGroupSlug } },
      update: {
        payload: JSON.stringify(payload),
        schemaVersion: CACHE_SCHEMA_VERSION,
        fetchedAt: now,
        expiresAt,
      },
      create: {
        pokedexId,
        versionGroupSlug,
        payload: JSON.stringify(payload),
        schemaVersion: CACHE_SCHEMA_VERSION,
        fetchedAt: now,
        expiresAt,
      },
    });
    return payload;
  })();
  inFlightDetailRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightDetailRequests.delete(key);
  }
}

export async function getPokemonDetails(
  pokedexId: number,
  options: ResolvePokemonDetailsOptions = {},
): Promise<PokemonDetailsResponse> {
  const now = options.now ?? new Date();
  const edition = await resolveEdition(options.gameVersionKey);
  const versionGroupSlug = edition?.versionGroupSlug ?? NO_EDITION_CACHE_KEY;
  const cached = await prisma.pokemonEditionDetailCache.findUnique({
    where: { pokedexId_versionGroupSlug: { pokedexId, versionGroupSlug } },
  });
  const cachedPayload = cached?.schemaVersion === CACHE_SCHEMA_VERSION
    ? parseCachedPayload(cached.payload)
    : null;

  if (cached && cachedPayload && cached.expiresAt.getTime() > now.getTime()) {
    return {
      ...cachedPayload,
      edition,
      cache: {
        status: 'hit',
        fetchedAt: cached.fetchedAt.toISOString(),
        expiresAt: cached.expiresAt.toISOString(),
        stale: false,
      },
    };
  }

  try {
    const payload = await refreshAndPersist(pokedexId, edition, versionGroupSlug, now);
    return {
      ...payload,
      edition,
      cache: {
        status: 'miss',
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
        stale: false,
      },
    };
  } catch (error) {
    if (cached && cachedPayload) {
      console.warn(`PokeAPI nicht erreichbar; verwende veralteten Detail-Cache für #${pokedexId}.`, error);
      return {
        ...cachedPayload,
        edition,
        cache: {
          status: 'stale',
          fetchedAt: cached.fetchedAt.toISOString(),
          expiresAt: cached.expiresAt.toISOString(),
          stale: true,
        },
      };
    }
    throw error;
  }
}
