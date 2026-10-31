import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    encounter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    player: { findMany: vi.fn() },
    liveRevision: { upsert: vi.fn() },
  };
  return { tx, transaction: vi.fn(), emitEvent: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ default: { $transaction: mocks.transaction } }));
vi.mock('@/lib/event-store', () => ({ emitEvent: mocks.emitEvent }));

import { executeEncounterLinkAdminAction } from '@/lib/encounter-link-admin.server';

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

function arrangeGroup(initial: unknown[], updated = initial) {
  mocks.tx.encounter.findMany
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(updated);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.tx.encounter.findFirst.mockResolvedValue(null);
  mocks.tx.encounter.updateMany.mockResolvedValue({ count: 2 });
  mocks.tx.encounter.deleteMany.mockResolvedValue({ count: 2 });
  mocks.tx.player.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
});

describe('executeEncounterLinkAdminAction', () => {
  it('normalizes a mixed legacy group with a group-wide knockout', async () => {
    const date = new Date('2026-08-10T12:00:00.000Z');
    arrangeGroup([
      member(1, 1, { isKnockedOut: true, koCausedBy: 'Alt', koDate: date }),
      member(2, 2),
    ]);

    const result = await executeEncounterLinkAdminAction(10, {
      action: 'knockout',
      causedBy: 'Lukas',
      reason: null,
    });

    expect(result).toMatchObject({ ok: true, response: { routeId: 10, count: 2 } });
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: expect.objectContaining({
        teamSlot: null,
        isKnockedOut: true,
        isNotCaught: false,
        koCausedBy: 'Lukas',
      }),
    });
    expect(mocks.tx.liveRevision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { topic: 'encounters' } }),
    );
  });

  it('removes all team slots even when statuses are mixed', async () => {
    arrangeGroup([
      member(1, 1, { teamSlot: 1 }),
      member(2, 2, { teamSlot: 2, isNotCaught: true }),
    ]);
    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: null,
    });
    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: { teamSlot: null },
    });
  });

  it('allows assignment to normalize only mixed slots on a complete active link', async () => {
    arrangeGroup([member(1, 1, { teamSlot: 1 }), member(2, 2, { teamSlot: 2 })]);
    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: 4,
    });
    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamSlot: 4, routeId: { not: 10 } },
      }),
    );
    expect(mocks.emitEvent).not.toHaveBeenCalledWith(
      'team_link_added',
      expect.anything(),
    );
  });

  it('emits a team reveal only when a complete link joins the team from outside', async () => {
    const initial = [member(1, 1), member(2, 2)];
    const updated = [
      member(1, 1, {
        teamSlot: 4,
        pokemon: {
          ...member(1, 1).pokemon,
          name: 'azumarill',
          nameGerman: 'Azumarill',
          spriteUrl: '/azumarill.png',
        },
      }),
      member(2, 2, {
        teamSlot: 4,
        pokemon: {
          ...member(2, 2).pokemon,
          name: 'galvantula',
          nameGerman: 'Voltula',
          spriteUrl: '/voltula.png',
        },
      }),
    ];
    arrangeGroup(initial, updated);

    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: 4,
    });

    expect(result.ok).toBe(true);
    expect(mocks.emitEvent).toHaveBeenCalledWith('team_link_added', {
      routeName: 'Route 10',
      teamSlot: 4,
      teamMembers: [
        {
          pokemonName: 'azumarill',
          pokemonNameGerman: 'Azumarill',
          spriteUrl: '/azumarill.png',
          playerName: 'Lukas',
        },
        {
          pokemonName: 'galvantula',
          pokemonNameGerman: 'Voltula',
          spriteUrl: '/voltula.png',
          playerName: 'Timo',
        },
      ],
    });
  });

  it('emits a box reveal when a linked group leaves its team slot', async () => {
    const initial = [
      member(1, 1, { teamSlot: 4 }),
      member(2, 2, { teamSlot: 4 }),
    ];
    const updated = [
      member(1, 1, {
        pokemon: {
          ...member(1, 1).pokemon,
          name: 'azumarill',
          nameGerman: 'Azumarill',
          spriteUrl: '/azumarill.png',
        },
      }),
      member(2, 2, {
        pokemon: {
          ...member(2, 2).pokemon,
          name: 'galvantula',
          nameGerman: 'Voltula',
          spriteUrl: '/voltula.png',
        },
      }),
    ];
    arrangeGroup(initial, updated);

    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: null,
    });

    expect(result.ok).toBe(true);
    expect(mocks.emitEvent).toHaveBeenCalledWith('team_link_boxed', {
      routeName: 'Route 10',
      teamSlot: 4,
      teamMembers: [
        {
          pokemonName: 'azumarill',
          pokemonNameGerman: 'Azumarill',
          spriteUrl: '/azumarill.png',
          playerName: 'Lukas',
        },
        {
          pokemonName: 'galvantula',
          pokemonNameGerman: 'Voltula',
          spriteUrl: '/voltula.png',
          playerName: 'Timo',
        },
      ],
    });
  });

  it('does not show a box reveal for a link that was already outside the team', async () => {
    arrangeGroup([member(1, 1), member(2, 2)]);

    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: null,
    });

    expect(result.ok).toBe(true);
    expect(mocks.emitEvent).not.toHaveBeenCalledWith(
      'team_link_boxed',
      expect.anything(),
    );
  });

  it('blocks team assignment for mixed status or an incomplete player roster', async () => {
    const date = new Date('2026-08-10T12:00:00.000Z');
    mocks.tx.encounter.findMany.mockResolvedValueOnce([
      member(1, 1, { isKnockedOut: true, koCausedBy: 'Lukas', koDate: date }),
      member(2, 2),
    ]);
    const mixed = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: 3,
    });
    expect(mixed).toMatchObject({ ok: false, status: 409 });
    expect(mocks.tx.encounter.updateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.encounter.findMany.mockResolvedValueOnce([member(1, 1)]);
    mocks.tx.player.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const incomplete = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: 3,
    });
    expect(incomplete).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringContaining('1 von 2'),
    });
  });

  it('detects a slot conflict against another route link', async () => {
    mocks.tx.encounter.findMany.mockResolvedValueOnce([member(1, 1), member(2, 2)]);
    mocks.tx.encounter.findFirst.mockResolvedValue({
      routeId: 99,
      route: { name: 'Route 99' },
    });
    const result = await executeEncounterLinkAdminAction(10, {
      action: 'set-team-slot',
      teamSlot: 2,
    });
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      conflict: { routeId: 99, routeName: 'Route 99', teamSlot: 2 },
    });
  });

  it('replaces the route on an occupied slot in one transaction', async () => {
    const occupant = [
      member(3, 1, { routeId: 99, route: { id: 99, name: 'Route 99' } }),
      member(4, 2, { routeId: 99, route: { id: 99, name: 'Route 99' } }),
    ];
    mocks.tx.encounter.findMany
      .mockResolvedValueOnce([member(1, 1), member(2, 2)])
      .mockResolvedValueOnce([member(1, 1, { teamSlot: 2 }), member(2, 2, { teamSlot: 2 })])
      .mockResolvedValueOnce(occupant);
    mocks.tx.encounter.findFirst.mockResolvedValue({ routeId: 99, route: { name: 'Route 99' } });

    const result = await executeEncounterLinkAdminAction(10, { action: 'take-team-slot', teamSlot: 2 });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 99 },
      data: { teamSlot: null },
    });
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: { teamSlot: 2 },
    });
    // Die Tabelle aktualisiert ihren Stand aus der Antwort, auch für die verdrängte Route.
    expect(result).toMatchObject({ ok: true, response: { count: 2 } });
    expect(result.ok && result.response.encounters.map((encounter) => encounter.id)).toEqual([1, 2, 3, 4]);
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'team_link_boxed',
      expect.objectContaining({ routeName: 'Route 99', teamSlot: 2 }),
    );
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'team_link_added',
      expect.objectContaining({ routeName: 'Route 10', teamSlot: 2 }),
    );
  });

  it('swaps two team routes without a team reveal', async () => {
    mocks.tx.encounter.findMany
      .mockResolvedValueOnce([member(1, 1, { teamSlot: 1 }), member(2, 2, { teamSlot: 1 })])
      .mockResolvedValueOnce([member(1, 1, { teamSlot: 5 }), member(2, 2, { teamSlot: 5 })])
      .mockResolvedValueOnce([member(3, 1, { teamSlot: 1 })]);
    mocks.tx.encounter.findFirst.mockResolvedValue({ routeId: 99, route: { name: 'Route 99' } });

    const result = await executeEncounterLinkAdminAction(10, { action: 'take-team-slot', teamSlot: 5 });

    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 99 },
      data: { teamSlot: 1 },
    });
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('takes a free slot like a normal assignment', async () => {
    arrangeGroup([member(1, 1), member(2, 2)], [member(1, 1, { teamSlot: 6 }), member(2, 2, { teamSlot: 6 })]);

    const result = await executeEncounterLinkAdminAction(10, { action: 'take-team-slot', teamSlot: 6 });

    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.emitEvent).toHaveBeenCalledWith('team_link_added', expect.anything());
  });

  it('does not displace anyone for an inactive or incomplete route', async () => {
    const date = new Date('2026-08-10T12:00:00.000Z');
    const knockedOut = { isKnockedOut: true, koCausedBy: 'Lukas', koDate: date };
    mocks.tx.encounter.findMany.mockResolvedValueOnce([member(1, 1, knockedOut), member(2, 2, knockedOut)]);
    expect(
      await executeEncounterLinkAdminAction(10, { action: 'take-team-slot', teamSlot: 2 }),
    ).toMatchObject({ ok: false, status: 409 });

    mocks.tx.encounter.findMany.mockResolvedValueOnce([member(1, 1)]);
    expect(
      await executeEncounterLinkAdminAction(10, { action: 'take-team-slot', teamSlot: 2 }),
    ).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('1 von 2') });

    expect(mocks.tx.encounter.updateMany).not.toHaveBeenCalled();
  });

  it('restores the team slot when undoing a knockout, without a team reveal', async () => {
    const date = new Date('2026-08-10T12:00:00.000Z');
    const knockedOut = { isKnockedOut: true, koCausedBy: 'Lukas', koDate: date };
    arrangeGroup(
      [member(1, 1, knockedOut), member(2, 2, knockedOut)],
      [member(1, 1, { teamSlot: 3 }), member(2, 2, { teamSlot: 3 })],
    );

    const result = await executeEncounterLinkAdminAction(10, { action: 'reactivate', teamSlot: 3 });

    expect(result.ok).toBe(true);
    expect(mocks.tx.encounter.updateMany).toHaveBeenCalledWith({
      where: { routeId: 10 },
      data: expect.objectContaining({ teamSlot: 3, isKnockedOut: false, koCausedBy: null }),
    });
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('keeps the knockout when the old team slot is taken in the meantime', async () => {
    const date = new Date('2026-08-10T12:00:00.000Z');
    const knockedOut = { isKnockedOut: true, koCausedBy: 'Lukas', koDate: date };
    mocks.tx.encounter.findMany.mockResolvedValueOnce([member(1, 1, knockedOut), member(2, 2, knockedOut)]);
    mocks.tx.encounter.findFirst.mockResolvedValue({ routeId: 99, route: { name: 'Route 99' } });

    const result = await executeEncounterLinkAdminAction(10, { action: 'reactivate', teamSlot: 3 });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      conflict: { routeId: 99, routeName: 'Route 99', teamSlot: 3 },
    });
    expect(mocks.tx.encounter.updateMany).not.toHaveBeenCalled();
  });

  it('deletes an inconsistent link atomically by routeId', async () => {
    mocks.tx.encounter.findMany.mockResolvedValueOnce([
      member(1, 1, { teamSlot: 1 }),
      member(2, 2, { teamSlot: 2, isKnockedOut: true }),
    ]);
    const result = await executeEncounterLinkAdminAction(10, { action: 'delete-link' });
    expect(result).toMatchObject({
      ok: true,
      response: { action: 'delete-link', count: 2, encounters: [] },
    });
    expect(mocks.tx.encounter.deleteMany).toHaveBeenCalledWith({ where: { routeId: 10 } });
  });
});
