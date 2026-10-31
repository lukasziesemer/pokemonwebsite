import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PokemonDetailsResponse } from '@/lib/pokemon-details';

let client: typeof import('@/lib/pokemon-details-client');

function details(pokedexId: number, edition = 'black2'): PokemonDetailsResponse {
  return {
    pokemon: { pokedexId },
    edition: { key: edition },
    levelUpMoves: [],
  } as unknown as PokemonDetailsResponse;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  client = await import('@/lib/pokemon-details-client');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared Pokémon detail requests', () => {
  it('deduplicates pop-out and comparison consumers and reuses their response', async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const dialog = client.loadPokemonDetails(25, 'black2');
    const comparison = client.loadPokemonDetails(25, ' BLACK2 ');
    expect(dialog).toBe(comparison);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A consumer has no abort signal that could cancel another consumer's request.
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/pokemon/25/details?gameVersion=black2',
      { headers: { Accept: 'application/json' } },
    ]);

    complete(jsonResponse(details(25)));
    const response = await dialog;
    expect(await comparison).toBe(response);
    expect(await client.loadPokemonDetails(25, 'black2')).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps responses for different editions and unassigned runs separate', async () => {
    const fetchMock = vi.fn(async (url: string) => jsonResponse(
      details(25, url.includes('black2') ? 'black2' : url.includes('white') ? 'white' : 'none'),
    ));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      client.loadPokemonDetails(25, 'black2'),
      client.loadPokemonDetails(25, 'white'),
      client.loadPokemonDetails(25, null),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.peekPokemonDetails(25, 'black2')?.edition?.key).toBe('black2');
    expect(client.peekPokemonDetails(25, 'white')?.edition?.key).toBe('white');
    expect(client.peekPokemonDetails(25, null)?.edition?.key).toBe('none');
    expect(client.getPokemonDetailsRequestUrl(25, null)).toBe('/api/pokemon/25/details?gameVersion=none');
    expect(client.getPokemonDetailsRequestUrl(25, undefined)).toBe('/api/pokemon/25/details');
  });

  it('limits network fan-out to three concurrent Pokémon requests', async () => {
    const pending: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn((url: string) => new Promise<Response>(resolve => {
      active += 1;
      peak = Math.max(peak, active);
      pending.push(() => {
        active -= 1;
        resolve(jsonResponse(details(Number(url.split('/')[3]))));
      });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const requests = Array.from({ length: 7 }, (_, index) => client.loadPokemonDetails(index + 1, 'black2'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending.splice(0).forEach(complete => complete());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    pending.splice(0).forEach(complete => complete());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    pending.splice(0).forEach(complete => complete());
    await Promise.all(requests);
    expect(peak).toBe(3);
  });

  it('expires memory entries after five minutes', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.fn(async () => jsonResponse(details(25)));
    vi.stubGlobal('fetch', fetchMock);

    await client.loadPokemonDetails(25, 'black2');
    now += 5 * 60 * 1000 - 1;
    expect(client.peekPokemonDetails(25, 'black2')).toBeDefined();
    now += 1;
    expect(client.peekPokemonDetails(25, 'black2')).toBeUndefined();
    await client.loadPokemonDetails(25, 'black2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds the cache to 100 entries and evicts the least recently read entry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => jsonResponse(details(Number(url.split('/')[3])))));
    for (let id = 1; id <= 100; id += 1) await client.loadPokemonDetails(id, 'black2');
    expect(client.peekPokemonDetails(1, 'black2')).toBeDefined();
    await client.loadPokemonDetails(101, 'black2');
    expect(client.peekPokemonDetails(1, 'black2')).toBeDefined();
    expect(client.peekPokemonDetails(2, 'black2')).toBeUndefined();
    expect(client.peekPokemonDetails(101, 'black2')).toBeDefined();
  });

  it('shows a readable JSON error and retries without caching failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Pokémon-Details konnten nicht geladen werden' }, 502))
      .mockResolvedValueOnce(jsonResponse(details(25)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.loadPokemonDetails(25, 'black2'))
      .rejects.toThrow('Pokémon-Details konnten nicht geladen werden');
    expect(client.peekPokemonDetails(25, 'black2')).toBeUndefined();
    await expect(client.loadPokemonDetails(25, 'black2')).resolves.toMatchObject({ pokemon: { pokedexId: 25 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hides raw proxy HTML and localizes network errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<h1>Bad Gateway</h1>', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.loadPokemonDetails(25, 'black2')).rejects.toThrow('Bitte erneut versuchen.');
    await expect(client.loadPokemonDetails(25, 'black2')).rejects.toThrow('Bitte erneut versuchen.');
  });

  it('does not repopulate the cache from a request invalidated while in flight', async () => {
    const pending: Array<(value: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))));
    const oldRequest = client.loadPokemonDetails(25, 'black2');
    client.invalidatePokemonDetails(25, 'black2');
    const newRequest = client.loadPokemonDetails(25, 'black2');

    pending[1](jsonResponse({ ...details(25), marker: 'new' }));
    const newDetails = await newRequest;
    pending[0](jsonResponse({ ...details(25), marker: 'old' }));
    await oldRequest;
    expect(client.peekPokemonDetails(25, 'black2')).toBe(newDetails);
  });

  it('notifies every open consumer when another consumer successfully retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Vorübergehend nicht erreichbar' }, 502))
      .mockResolvedValueOnce(jsonResponse(details(25)));
    vi.stubGlobal('fetch', fetchMock);

    let previouslyFailedColumn = client.peekPokemonDetails(25, 'black2');
    const columnListener = vi.fn(() => {
      previouslyFailedColumn = client.peekPokemonDetails(25, 'black2');
    });
    const modalListener = vi.fn();
    const unsubscribeColumn = client.subscribePokemonDetailsCache(columnListener);
    const unsubscribeModal = client.subscribePokemonDetailsCache(modalListener);
    const firstRevision = client.getPokemonDetailsCacheRevision();

    await expect(client.loadPokemonDetails(25, 'black2')).rejects.toThrow('Vorübergehend');
    expect(columnListener).not.toHaveBeenCalled();
    expect(previouslyFailedColumn).toBeUndefined();

    const response = await client.loadPokemonDetails(25, 'black2');
    expect(previouslyFailedColumn).toBe(response);
    expect(columnListener).toHaveBeenCalledTimes(1);
    expect(modalListener).toHaveBeenCalledTimes(1);
    expect(client.getPokemonDetailsCacheRevision()).toBeGreaterThan(firstRevision);

    unsubscribeModal();
    client.invalidatePokemonDetails(25, 'black2');
    expect(columnListener).toHaveBeenCalledTimes(2);
    expect(previouslyFailedColumn).toBeUndefined();
    expect(modalListener).toHaveBeenCalledTimes(1);
    unsubscribeColumn();
  });
});
