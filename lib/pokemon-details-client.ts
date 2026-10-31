import type { PokemonDetailsResponse } from '@/lib/pokemon-details';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 100;
const CONCURRENT_REQUEST_LIMIT = 3;
const LOAD_ERROR = 'Die Pokémon-Daten konnten nicht geladen werden. Bitte erneut versuchen.';

interface CachedDetails {
  details: PokemonDetailsResponse;
  expiresAt: number;
}

const responseCache = new Map<string, CachedDetails>();
const pendingRequests = new Map<string, Promise<PokemonDetailsResponse>>();
const requestQueue: Array<() => void> = [];
const cacheListeners = new Set<() => void>();
let activeRequests = 0;
let cacheRevision = 0;

/** Notify open consumers when a retry in another section/dialog fills their cache. */
export function subscribePokemonDetailsCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => { cacheListeners.delete(listener); };
}

export function getPokemonDetailsCacheRevision(): number {
  return cacheRevision;
}

function notifyCacheChanged(): void {
  cacheRevision += 1;
  cacheListeners.forEach(listener => listener());
}

export function getPokemonDetailsRequestUrl(
  pokedexId: number,
  gameVersionKey?: string | null,
): string {
  const edition = gameVersionKey?.trim().toLowerCase();
  const query = gameVersionKey === null
    ? '?gameVersion=none'
    : edition ? `?gameVersion=${encodeURIComponent(edition)}` : '';
  return `/api/pokemon/${pokedexId}/details${query}`;
}

export function peekPokemonDetails(
  pokedexId: number,
  gameVersionKey?: string | null,
): PokemonDetailsResponse | undefined {
  const key = getPokemonDetailsRequestUrl(pokedexId, gameVersionKey);
  const cached = responseCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }

  // Refresh insertion order so the least recently used entry is evicted first.
  responseCache.delete(key);
  responseCache.set(key, cached);
  return cached.details;
}

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push(() => {
      activeRequests += 1;
      task().then(resolve, reject).finally(() => {
        activeRequests -= 1;
        drainQueue();
      });
    });
    drainQueue();
  });
}

function drainQueue(): void {
  while (activeRequests < CONCURRENT_REQUEST_LIMIT && requestQueue.length > 0) {
    requestQueue.shift()?.();
  }
}

async function requestDetails(url: string): Promise<PokemonDetailsResponse> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error(LOAD_ERROR);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? body.error
      : null;
    throw new Error(typeof error === 'string' && error.trim() ? error : LOAD_ERROR);
  }
  if (!body || typeof body !== 'object' || !('pokemon' in body)) {
    throw new Error(LOAD_ERROR);
  }
  return body as PokemonDetailsResponse;
}

/** Shared requests outlive individual dialogs/sections; consumers ignore stale results. */
export function loadPokemonDetails(
  pokedexId: number,
  gameVersionKey?: string | null,
): Promise<PokemonDetailsResponse> {
  const cached = peekPokemonDetails(pokedexId, gameVersionKey);
  if (cached) return Promise.resolve(cached);

  const key = getPokemonDetailsRequestUrl(pokedexId, gameVersionKey);
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = enqueueRequest(() => requestDetails(key))
    .then(details => {
      // An invalidated request can still satisfy its consumers, but cannot refill the cache.
      if (pendingRequests.get(key) === request) {
        responseCache.set(key, { details, expiresAt: Date.now() + CACHE_TTL_MS });
        while (responseCache.size > CACHE_LIMIT) {
          const oldestKey = responseCache.keys().next().value;
          if (oldestKey === undefined) break;
          responseCache.delete(oldestKey);
        }
        notifyCacheChanged();
      }
      return details;
    })
    .finally(() => {
      if (pendingRequests.get(key) === request) pendingRequests.delete(key);
    });
  pendingRequests.set(key, request);
  return request;
}

export function invalidatePokemonDetails(
  pokedexId: number,
  gameVersionKey?: string | null,
): void {
  const key = getPokemonDetailsRequestUrl(pokedexId, gameVersionKey);
  responseCache.delete(key);
  pendingRequests.delete(key);
  notifyCacheChanged();
}
