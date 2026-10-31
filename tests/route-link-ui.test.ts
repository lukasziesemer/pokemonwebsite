import { describe, expect, it } from 'vitest';
import type { EncounterAdminTarget } from '@/lib/encounter-admin';
import {
  describeTeamSlot,
  describeTeamSlotChange,
  getEncounterRouteLinkState,
  getFirstFreeTeamSlot,
  getNextTeamSlot,
  getOccupiedTeamSlots,
  getTeamSlotRouteOptions,
  isRouteStatusChangeCurrent,
} from '@/components/admin/route-link-ui';

function encounter(
  id: number,
  playerId: number,
  overrides: Partial<EncounterAdminTarget> = {},
): EncounterAdminTarget {
  return {
    id,
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
    player: { id: playerId, name: `Spieler ${playerId}`, color: '#3b82f6' },
    route: { id: 7, name: 'Route 7' },
    pokemon: {
      id,
      pokedexId: id,
      name: `pokemon-${id}`,
      nameGerman: null,
      spriteUrl: null,
      spriteGifUrl: null,
    },
    ...overrides,
  };
}

describe('Route link UI state', () => {
  it('keeps incomplete links visible but blocks a team-slot assignment', () => {
    const state = getEncounterRouteLinkState({
      route: { id: 7, name: 'Route 7' },
      encounters: [encounter(1, 1), encounter(2, 2)],
      expectedPlayerCount: 3,
    });

    expect(state).toMatchObject({
      memberCount: 2,
      missingPlayerCount: 1,
      isComplete: false,
      canAssignToTeam: false,
    });
    expect(state.blockedReasons.join(' ')).toContain('fehlen');
  });

  it('allows a deliberate group assignment to repair mixed team slots', () => {
    const state = getEncounterRouteLinkState({
      route: { id: 7, name: 'Route 7' },
      encounters: [
        encounter(1, 1, { teamSlot: 1 }),
        encounter(2, 2, { teamSlot: 2 }),
      ],
      expectedPlayerCount: 2,
    });

    expect(state.isTeamSlotMixed).toBe(true);
    expect(state.teamSlot).toBe('mixed');
    expect(state.canAssignToTeam).toBe(true);
  });

  it('marks mixed statuses without hiding existing inactive members', () => {
    const state = getEncounterRouteLinkState({
      route: { id: 7, name: 'Route 7' },
      encounters: [
        encounter(1, 1),
        encounter(2, 2, {
          isKnockedOut: true,
          koCausedBy: 'Spieler 1',
          koDate: '2026-08-15T10:00:00.000Z',
        }),
      ],
      expectedPlayerCount: 2,
    });

    expect(state.isStatusMixed).toBe(true);
    expect(state.hasInactiveMembers).toBe(true);
    expect(state.canAssignToTeam).toBe(false);
  });
});

describe('Teamplatz-Belegung', () => {
  const routes = [
    { id: 1, name: 'Route 1', encounters: [{ teamSlot: 1 }, { teamSlot: 1 }] },
    { id: 2, name: 'Route 2', encounters: [{ teamSlot: null }] },
    { id: 3, name: 'Route 3', encounters: [{ teamSlot: 3 }] },
  ];

  it('ordnet belegte Plätze ihrer Route zu', () => {
    expect(getOccupiedTeamSlots(routes)).toEqual({
      1: { routeId: 1, routeName: 'Route 1' },
      3: { routeId: 3, routeName: 'Route 3' },
    });
  });

  it('findet den ersten freien Platz', () => {
    expect(getFirstFreeTeamSlot(getOccupiedTeamSlots(routes))).toBe(2);
  });

  it('meldet ein volles Team', () => {
    const fullTeam = [1, 2, 3, 4, 5, 6].map((slot) => ({
      id: slot,
      name: `Route ${slot}`,
      encounters: [{ teamSlot: slot }],
    }));

    expect(getFirstFreeTeamSlot(getOccupiedTeamSlots(fullTeam))).toBeNull();
  });

  it('zeigt die Belegung und hält alle Plätze einer aktiven Route wählbar', () => {
    const occupiedTeamSlots = getOccupiedTeamSlots(routes);
    const link = {
      route: { id: 3, name: 'Route 3' },
      encounters: [encounter(1, 1, { teamSlot: 3 })],
      occupiedTeamSlots,
    };

    expect(describeTeamSlot(1, link, true)).toEqual({ label: 'Platz 1 · Route 1', disabled: false });
    expect(describeTeamSlot(2, link, true)).toEqual({ label: 'Platz 2 · frei', disabled: false });
    expect(describeTeamSlot(3, link, true)).toEqual({ label: 'Platz 3 · Route 3', disabled: false });
    expect(describeTeamSlot(2, link, false)).toEqual({ label: 'Platz 2 · frei', disabled: true });
  });

  it('kündigt Tausch und Ersetzen an, aber nicht beim freien oder eigenen Platz', () => {
    const occupiedTeamSlots = getOccupiedTeamSlots(routes);
    const inTeam = {
      route: { id: 3, name: 'Route 3' },
      encounters: [encounter(1, 1, { teamSlot: 3 })],
      occupiedTeamSlots,
    };
    const outsideTeam = {
      route: { id: 9, name: 'Route 9' },
      encounters: [encounter(2, 1)],
      occupiedTeamSlots,
    };

    expect(describeTeamSlotChange(2, inTeam)).toBeNull();
    expect(describeTeamSlotChange(3, inTeam)).toBeNull();
    expect(describeTeamSlotChange(1, inTeam)).toEqual({
      confirm: 'Plätze tauschen',
      hint: 'Route 3 und Route 1 tauschen die Plätze: Route 1 rückt auf Platz 3.',
    });
    expect(describeTeamSlotChange(1, outsideTeam)).toEqual({
      confirm: 'Route ersetzen',
      hint: 'Route 1 verliert Platz 1 und kommt aus dem Team.',
    });
  });
});

describe('Rückgängig nach einem Statuswechsel', () => {
  const change = {
    routeId: 1,
    routeName: 'Route 1',
    status: 'knockout' as const,
    statusDate: '2026-10-31T12:00:00.000Z',
    teamSlot: 2,
  };
  const withDates = (koDate: string | null, notCaughtDate: string | null = null) => [
    { id: 1, encounters: [{ koDate, notCaughtDate }, { koDate, notCaughtDate }] },
  ];

  it('gilt, solange die Route genau in diesem Status steht', () => {
    expect(isRouteStatusChangeCurrent(change, withDates(change.statusDate))).toBe(true);
    expect(
      isRouteStatusChangeCurrent(
        { ...change, status: 'not-caught' },
        withDates(null, change.statusDate),
      ),
    ).toBe(true);
  });

  it('verfällt nach Reaktivieren, neuem Status oder Löschen', () => {
    expect(isRouteStatusChangeCurrent(change, withDates(null))).toBe(false);
    expect(isRouteStatusChangeCurrent(change, withDates(null, change.statusDate))).toBe(false);
    expect(isRouteStatusChangeCurrent(change, withDates('2026-10-31T13:00:00.000Z'))).toBe(false);
    expect(isRouteStatusChangeCurrent(change, [{ id: 1, encounters: [] }])).toBe(false);
    expect(isRouteStatusChangeCurrent(change, [])).toBe(false);
  });
});

describe('Routenauswahl für einen Teamplatz', () => {
  it('sperrt eine Route, solange ein Spieler fehlt, obwohl sonst niemand erfasst ist', () => {
    const [option] = getTeamSlotRouteOptions(
      [{
        route: { id: 7, name: 'Route 7' },
        encounters: [encounter(1, 1)],
        expectedPlayerCount: 2,
      }],
      1,
      'Spieler 1',
    );

    expect(option.state.expectedPlayerCount).toBe(2);
    expect(option.canAssign).toBe(false);
    expect(option.disabledReason).toBe('Unvollständig');
  });

  it('blendet Routen aus, die bereits im Team sind', () => {
    const options = getTeamSlotRouteOptions(
      [{
        route: { id: 7, name: 'Route 7' },
        encounters: [encounter(1, 1, { teamSlot: 2 })],
        expectedPlayerCount: 1,
      }],
      1,
      'Spieler 1',
    );

    expect(options).toEqual([]);
  });
});

describe('Platz für „Ins Team“', () => {
  const occupiedTeamSlots = { 1: { routeId: 1, routeName: 'Route 1' } };

  it('nimmt den ersten freien Platz für eine vollständige Route', () => {
    expect(getNextTeamSlot({
      route: { id: 7, name: 'Route 7' },
      encounters: [encounter(1, 1), encounter(2, 2)],
      expectedPlayerCount: 2,
      occupiedTeamSlots,
    })).toBe(2);
  });

  it('lehnt unvollständige, bereits aufgenommene und K.O.-Routen ab', () => {
    const base = { route: { id: 7, name: 'Route 7' }, expectedPlayerCount: 2, occupiedTeamSlots };

    expect(getNextTeamSlot({ ...base, encounters: [encounter(1, 1)] })).toBeNull();
    expect(getNextTeamSlot({
      ...base,
      encounters: [encounter(1, 1, { teamSlot: 3 }), encounter(2, 2, { teamSlot: 3 })],
    })).toBeNull();
    expect(getNextTeamSlot({
      ...base,
      encounters: [encounter(1, 1, { isKnockedOut: true }), encounter(2, 2, { isKnockedOut: true })],
    })).toBeNull();
  });

  it('meldet bei vollem Team keinen Platz', () => {
    const fullTeam = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((slot) => [slot, { routeId: slot, routeName: `Route ${slot}` }]),
    );

    expect(getNextTeamSlot({
      route: { id: 7, name: 'Route 7' },
      encounters: [encounter(1, 1), encounter(2, 2)],
      expectedPlayerCount: 2,
      occupiedTeamSlots: fullTeam,
    })).toBeNull();
  });
});
