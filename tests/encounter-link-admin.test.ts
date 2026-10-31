import { describe, expect, it } from 'vitest';
import {
  auditEncounterLinkGroup,
  buildEncounterLinkUpdate,
  parseEncounterLinkAdminAction,
  type EncounterLinkConsistencyInput,
} from '@/lib/encounter-link-admin';

function encounter(
  id: number,
  playerId: number,
  overrides: Partial<EncounterLinkConsistencyInput> = {},
): EncounterLinkConsistencyInput {
  return {
    id,
    routeId: 10,
    playerId,
    teamSlot: null,
    isKnockedOut: false,
    koCausedBy: null,
    koReason: null,
    koDate: null,
    isNotCaught: false,
    notCaughtBy: null,
    notCaughtReason: null,
    notCaughtDate: null,
    ...overrides,
  };
}

describe('encounter-link action contract', () => {
  it('normalizes all supported group actions', () => {
    expect(parseEncounterLinkAdminAction({ action: 'set-team-slot', teamSlot: 3 })).toEqual({
      ok: true,
      action: { action: 'set-team-slot', teamSlot: 3 },
    });
    expect(
      parseEncounterLinkAdminAction({ action: 'knockout', causedBy: ' Lukas ', reason: '  ' }),
    ).toEqual({
      ok: true,
      action: { action: 'knockout', causedBy: 'Lukas', reason: null },
    });
    expect(parseEncounterLinkAdminAction({ action: 'reactivate' })).toEqual({
      ok: true,
      action: { action: 'reactivate' },
    });
    expect(parseEncounterLinkAdminAction({ action: 'reactivate', teamSlot: 2 })).toEqual({
      ok: true,
      action: { action: 'reactivate', teamSlot: 2 },
    });
    expect(parseEncounterLinkAdminAction({ action: 'reactivate', teamSlot: 7 })).toMatchObject({ ok: false });
    expect(parseEncounterLinkAdminAction({ action: 'take-team-slot', teamSlot: 4 })).toEqual({
      ok: true,
      action: { action: 'take-team-slot', teamSlot: 4 },
    });
    expect(parseEncounterLinkAdminAction({ action: 'take-team-slot', teamSlot: null })).toMatchObject({ ok: false });
    expect(parseEncounterLinkAdminAction({ action: 'delete-link' })).toMatchObject({ ok: true });
  });

  it('normalizes status actions across every group field', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    expect(
      buildEncounterLinkUpdate(
        { action: 'not-caught', causedBy: 'Timo', reason: null },
        now,
      ),
    ).toEqual({
      teamSlot: null,
      isNotCaught: true,
      notCaughtBy: 'Timo',
      notCaughtReason: null,
      notCaughtDate: now,
      isKnockedOut: false,
      koCausedBy: null,
      koReason: null,
      koDate: null,
    });
    expect(buildEncounterLinkUpdate({ action: 'reactivate' })).toMatchObject({
      teamSlot: null,
      isKnockedOut: false,
      isNotCaught: false,
      koCausedBy: null,
      notCaughtBy: null,
    });
  });
});

describe('read-only encounter-link consistency audit', () => {
  it('accepts a uniform complete active link', () => {
    const report = auditEncounterLinkGroup(
      [encounter(1, 1, { teamSlot: 2 }), encounter(2, 2, { teamSlot: 2 })],
      [1, 2],
    );
    expect(report).toMatchObject({
      routeId: 10,
      consistent: true,
      status: 'active',
      teamSlot: 2,
      playerCount: 2,
      activePlayerCount: 2,
      issues: [],
    });
  });

  it('reports mixed slots, statuses and metadata', () => {
    const date = new Date('2026-08-15T12:00:00.000Z');
    const report = auditEncounterLinkGroup([
      encounter(1, 1, {
        teamSlot: 1,
        isKnockedOut: true,
        koCausedBy: 'Lukas',
        koDate: date,
      }),
      encounter(2, 2, { teamSlot: 2 }),
    ]);
    expect(report.consistent).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'mixed-team-slots',
        'mixed-status',
        'mixed-ko-metadata',
        'inactive-in-team',
      ]),
    );
  });

  it('reports dual status, stale metadata and incomplete players', () => {
    const date = new Date('2026-08-15T12:00:00.000Z');
    const report = auditEncounterLinkGroup(
      [
        encounter(1, 1, {
          isKnockedOut: true,
          koCausedBy: 'Lukas',
          koDate: date,
          isNotCaught: true,
          notCaughtBy: 'Timo',
          notCaughtDate: date,
        }),
      ],
      [1, 2],
    );
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['dual-status', 'incomplete-player-roster']),
    );

    const stale = auditEncounterLinkGroup([
      encounter(2, 1, { koCausedBy: 'Alt', koDate: date }),
    ]);
    expect(stale.issues.map((issue) => issue.code)).toContain('stale-ko-metadata');
  });

  it('reports missing required status metadata', () => {
    const report = auditEncounterLinkGroup([
      encounter(1, 1, { isKnockedOut: true }),
      encounter(2, 2, { isKnockedOut: true }),
    ]);
    expect(report.issues.map((issue) => issue.code)).toContain('missing-ko-metadata');
  });
});
