import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getPokemonDetails: vi.fn() }));

vi.mock('@/lib/pokemon-details.server', () => ({
  getPokemonDetails: mocks.getPokemonDetails,
}));

import { GET } from '@/app/api/pokemon/[pokedexId]/details/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPokemonDetails.mockResolvedValue({ pokemon: { pokedexId: 25 } });
});

describe('GET /api/pokemon/[pokedexId]/details', () => {
  it('rejects an invalid Pokédex ID', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/pokemon/nope/details'),
      { params: Promise.resolve({ pokedexId: 'nope' }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.getPokemonDetails).not.toHaveBeenCalled();
  });

  it('rejects unknown editions instead of displaying a wrong move list', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/pokemon/25/details?gameVersion=fan-game'),
      { params: Promise.resolve({ pokedexId: '25' }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.getPokemonDetails).not.toHaveBeenCalled();
  });

  it('passes the explicit run edition to the service', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/pokemon/25/details?gameVersion=black2'),
      { params: Promise.resolve({ pokedexId: '25' }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.getPokemonDetails).toHaveBeenCalledWith(25, { gameVersionKey: 'black2' });
  });

  it('allows the service to resolve the current run when the query is omitted', async () => {
    await GET(
      new NextRequest('http://localhost/api/pokemon/25/details'),
      { params: Promise.resolve({ pokedexId: '25' }) },
    );
    expect(mocks.getPokemonDetails).toHaveBeenCalledWith(25, { gameVersionKey: undefined });
  });

  it('keeps an explicitly unassigned edition separate from the implicit current run', async () => {
    await GET(
      new NextRequest('http://localhost/api/pokemon/25/details?gameVersion=none'),
      { params: Promise.resolve({ pokedexId: '25' }) },
    );
    expect(mocks.getPokemonDetails).toHaveBeenCalledWith(25, { gameVersionKey: null });
  });
});
