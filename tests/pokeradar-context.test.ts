import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runFindFirst: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { run: { findFirst: mocks.runFindFirst } } }));

import { GET } from '@/app/api/pokeradar/context/route';
import { EMPTY_COMPARISON_RUN_CONTEXT } from '@/lib/pokeradar-context';

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    gameVersionKey: 'black2',
    gameVersion: { name: 'Pokémon Schwarz 2' },
    badgesEarned: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runFindFirst.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/pokeradar/context', () => {
  it('prefers the active nonarchived run and selects the next badge level cap', async () => {
    mocks.runFindFirst.mockResolvedValueOnce(run()).mockResolvedValueOnce(run({ id: 12, gameVersionKey: 'white' }));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      gameVersionKey: 'black2',
      gameVersionName: 'Pokémon Schwarz 2',
      levelCap: 30,
      runId: 11,
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.runFindFirst).toHaveBeenNthCalledWith(1, {
      where: { archived: false, status: 'active' },
      select: { id: true, badgesEarned: true, gameVersionKey: true, gameVersion: { select: { name: true } } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    expect(mocks.runFindFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { archived: false } }));
  });

  it('falls back to the latest nonarchived run with the same selection rule as the dashboard', async () => {
    mocks.runFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(run({
      id: 10, gameVersionKey: 'white', gameVersion: null, badgesEarned: 0,
    }));
    expect(await (await GET()).json()).toEqual({
      gameVersionKey: 'white', gameVersionName: 'Pokémon Weiß', levelCap: 14, runId: 10,
    });
  });

  it('returns no cap once all listed badges are earned', async () => {
    mocks.runFindFirst.mockResolvedValue(run({ badgesEarned: 8 }));
    expect(await (await GET()).json()).toMatchObject({ levelCap: null, gameVersionKey: 'black2' });
  });

  it('does not guess caps for editions without cap data', async () => {
    mocks.runFindFirst.mockResolvedValue(run({ gameVersionKey: 'sun', gameVersion: null }));
    expect(await (await GET()).json()).toMatchObject({ levelCap: null, gameVersionName: 'Pokémon Sonne' });
  });

  it('preserves a run without an edition and never borrows an edition from another run', async () => {
    mocks.runFindFirst.mockResolvedValueOnce(run({ gameVersionKey: null, gameVersion: null }))
      .mockResolvedValueOnce(run({ id: 10 }));
    expect(await (await GET()).json()).toEqual({ ...EMPTY_COMPARISON_RUN_CONTEXT, runId: 11 });
  });

  it('returns an explicit empty context when no run exists', async () => {
    expect(await (await GET()).json()).toEqual(EMPTY_COMPARISON_RUN_CONTEXT);
  });

  it('returns an error instead of misrepresenting a failed lookup as no current edition', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.runFindFirst.mockRejectedValue(new Error('Database unavailable'));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Die Edition des aktuellen Runs konnte nicht geladen werden.' });
  });
});
