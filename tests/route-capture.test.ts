import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';

const mocks = vi.hoisted(() => {
  const tx = {
    route: { findUnique: vi.fn() },
    encounter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    player: { findMany: vi.fn() },
    liveRevision: { upsert: vi.fn() },
  };
  return { tx, transaction: vi.fn(), emitEvent: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ default: { $transaction: mocks.transaction } }));
vi.mock('@/lib/event-store', () => ({ emitEvent: mocks.emitEvent }));

import { parseRouteCapture } from '@/lib/encounter-link-admin';
import { executeRouteCapture } from '@/lib/encounter-link-admin.server';

function member(id: number, playerId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    playerId,
    routeId: 10,
    pokemonId: 25 + id,
    nickname: null,
    teamSlot: null,
    isKnockedOut: false,
    koCausedBy: null,
    koReason: null,
    koDate: null,
    isNotCaught: false,
    notCaughtBy: null,
    notCaughtReason: null,
    notCaughtDate: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    player: { id: playerId, name: playerId === 1 ? 'Lukas' : 'Timo', color: '#2563eb' },
    route: { id: 10, name: 'Route 10' },
    pokemon: {
      id: 25 + id,
      pokedexId: 25 + id,
      name: `pokemon-${id}`,
      nameGerman: `Pokémon ${id}`,
      spriteUrl: null,
      spriteGifUrl: null,
    },
    ...overrides,
  };
}

const bothCatches = [
  { playerId: 1, pokemonId: 26, nickname: 'Blitz' },
  { playerId: 2, pokemonId: 27, nickname: null },
];

function arrangeGroup(initial: unknown[], updated: unknown[]) {
  mocks.tx.encounter.findMany.mockResolvedValueOnce(initial).mockResolvedValueOnce(updated);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.tx.route.findUnique.mockResolvedValue({ id: 10 });
  mocks.tx.encounter.findFirst.mockResolvedValue(null);
  mocks.tx.player.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
});

describe('parseRouteCapture', () => {
  const valid = {
    catches: [{ playerId: 1, pokemonId: 26, nickname: '  Blitz ' }],
    outcome: { type: 'box' },
  };

  it('normalizes nicknames and accepts all outcomes', () => {
    expect(parseRouteCapture(valid)).toEqual({
      ok: true,
      capture: {
        catches: [{ playerId: 1, pokemonId: 26, nickname: 'Blitz' }],
        outcome: { type: 'box' },
      },
    });
    expect(parseRouteCapture({ ...valid, outcome: { type: 'team', teamSlot: 6 } }).ok).toBe(true);
    expect(
      parseRouteCapture({ ...valid, outcome: { type: 'not-caught', causedBy: 'Lukas' } }),
    ).toMatchObject({
      ok: true,
      capture: { outcome: { type: 'not-caught', causedBy: 'Lukas', reason: null } },
    });
  });

  it.each([
    ['no catches', { ...valid, catches: [] }],
    ['a broken id', { ...valid, catches: [{ playerId: '1', pokemonId: 26 }] }],
    ['a duplicate player', { ...valid, catches: [valid.catches[0], valid.catches[0]] }],
    ['a nickname that is too long', { ...valid, catches: [{ ...valid.catches[0], nickname: 'x'.repeat(61) }] }],
    ['an invalid team slot', { ...valid, outcome: { type: 'team', teamSlot: 7 } }],
    ['a not-caught without cause', { ...valid, outcome: { type: 'not-caught', causedBy: ' ' } }],
    ['an unknown outcome', { ...valid, outcome: { type: 'knockout' } }],
  ])('rejects %s', (_name, body) => {
    expect(parseRouteCapture(body).ok).toBe(false);
  });
});

describe('executeRouteCapture', () => {
  it('creates all catches and joins the team in one transaction', async () => {
    const captured = [member(1, 1, { teamSlot: 3 }), member(2, 2, { teamSlot: 3 })];
    arrangeGroup([], captured);

    const result = await executeRouteCapture(10, {
      catches: bothCatches,
      outcome: { type: 'team', teamSlot: 3 },
    });

    expect(result).toMatchObject({ ok: true, response: { routeId: 10, outcome: 'team', created: 2 } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.encounter.createMany).toHaveBeenCalledWith({
      data: [
        { playerId: 1, pokemonId: 26, nickname: 'Blitz', routeId: 10, teamSlot: null },
        { playerId: 2, pokemonId: 27, nickname: null, routeId: 10, teamSlot: null },
      ],
    });
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: { teamSlot: 3 },
    });
    expect(mocks.tx.liveRevision.upsert).toHaveBeenCalled();
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'team_link_added',
      expect.objectContaining({ routeName: 'Route 10', teamSlot: 3 }),
    );
  });

  it('records a partial catch without touching the route status', async () => {
    arrangeGroup([], [member(1, 1)]);

    const result = await executeRouteCapture(10, {
      catches: [bothCatches[0]],
      outcome: { type: 'box' },
    });

    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('completes a route that another player already started', async () => {
    arrangeGroup([member(1, 1)], [member(1, 1), member(2, 2, { teamSlot: 2 })]);

    const result = await executeRouteCapture(10, {
      catches: [bothCatches[1]],
      outcome: { type: 'team', teamSlot: 2 },
    });

    expect(result.ok).toBe(true);
  });

  it('marks all members as not caught, including the new ones', async () => {
    const date = new Date('2026-08-02T12:00:00.000Z');
    const notCaught = { isNotCaught: true, notCaughtBy: 'Timo', notCaughtDate: date };
    arrangeGroup([], [member(1, 1, notCaught), member(2, 2, notCaught)]);

    const result = await executeRouteCapture(10, {
      catches: bothCatches,
      outcome: { type: 'not-caught', causedBy: 'Timo', reason: 'Geflohen' },
    });

    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: expect.objectContaining({
        isNotCaught: true,
        notCaughtBy: 'Timo',
        notCaughtReason: 'Geflohen',
        teamSlot: null,
      }),
    });
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'pokemon_not_caught',
      expect.objectContaining({ playerName: 'Timo', pokemonName: 'pokemon-2' }),
    );
  });

  it('inherits the slot of a route that is already in the team', async () => {
    arrangeGroup(
      [member(1, 1, { teamSlot: 4 })],
      [member(1, 1, { teamSlot: 4 }), member(2, 2, { teamSlot: 4 })],
    );

    await executeRouteCapture(10, { catches: [bothCatches[1]], outcome: { type: 'box' } });

    expect(mocks.tx.encounter.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ playerId: 2, teamSlot: 4 })],
    });
  });

  it.each([
    [
      'a team capture with a missing player',
      [],
      { catches: [bothCatches[0]], outcome: { type: 'team', teamSlot: 1 } as const },
      /1 von 2 aktiven Spielern/,
    ],
    [
      'a second Pokémon for one player',
      [member(1, 1)],
      { catches: [bothCatches[0]], outcome: { type: 'box' } as const },
      /Lukas hat auf dieser Route bereits/,
    ],
    [
      'an inactive route',
      [member(1, 1, { isKnockedOut: true, koCausedBy: 'Timo', koDate: new Date() })],
      { catches: [bothCatches[1]], outcome: { type: 'box' } as const },
      /reaktiviert/,
    ],
  ])('rejects %s before writing', async (_name, existing, capture, message) => {
    mocks.tx.encounter.findMany.mockResolvedValueOnce(existing);

    const result = await executeRouteCapture(10, capture);

    expect(result).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(message) });
    expect(mocks.tx.encounter.createMany).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('reports an occupied team slot with its route', async () => {
    mocks.tx.encounter.findMany.mockResolvedValueOnce([]);
    mocks.tx.encounter.findFirst.mockResolvedValue({ routeId: 7, route: { name: 'Route 7' } });

    const result = await executeRouteCapture(10, {
      catches: bothCatches,
      outcome: { type: 'team', teamSlot: 1 },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      conflict: { routeId: 7, routeName: 'Route 7', teamSlot: 1 },
    });
    expect(mocks.tx.encounter.createMany).not.toHaveBeenCalled();
  });

  it('rejects unknown routes and players', async () => {
    mocks.tx.route.findUnique.mockResolvedValueOnce(null);
    expect(
      await executeRouteCapture(10, { catches: bothCatches, outcome: { type: 'box' } }),
    ).toMatchObject({ ok: false, status: 404 });

    mocks.tx.encounter.findMany.mockResolvedValueOnce([]);
    expect(
      await executeRouteCapture(10, {
        catches: [{ playerId: 9, pokemonId: 26, nickname: null }],
        outcome: { type: 'box' },
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('retries serialization conflicts and maps unknown Pokémon', async () => {
    const serialization = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    mocks.transaction.mockRejectedValueOnce(serialization);
    arrangeGroup([], [member(1, 1)]);
    expect(
      await executeRouteCapture(10, { catches: [bothCatches[0]], outcome: { type: 'box' } }),
    ).toMatchObject({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);

    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('foreign key', { code: 'P2003', clientVersion: 'test' }),
    );
    expect(
      await executeRouteCapture(10, { catches: [bothCatches[0]], outcome: { type: 'box' } }),
    ).toMatchObject({ ok: false, status: 400, error: 'Ungültige Pokémon-ID' });
  });
});
