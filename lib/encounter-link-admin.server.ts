import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { emitEvent } from '@/lib/event-store';
import { bumpLiveRevisions } from '@/lib/live-updates.server';
import {
  auditEncounterLinkGroup,
  buildEncounterLinkUpdate,
  type EncounterLinkAdminAction,
  type EncounterLinkAuditResponse,
  type EncounterLinkAdminErrorResponse,
  type EncounterLinkAdminResponse,
  type EncounterLinkConsistencyInput,
  type RouteCaptureRequest,
  type RouteCaptureResponse,
} from '@/lib/encounter-link-admin';
import {
  encounterAdminInclude,
  serializeEncounterAdminTarget,
  type EncounterAdminPayload,
} from '@/lib/encounter-admin.server';

export type EncounterLinkExecutionResult =
  | { ok: true; response: EncounterLinkAdminResponse }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
      conflict?: EncounterLinkAdminErrorResponse['conflict'];
    };

export type RouteCaptureExecutionResult =
  | { ok: true; response: RouteCaptureResponse }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
      conflict?: EncounterLinkAdminErrorResponse['conflict'];
    };

function teamMembersForEvent(encounters: EncounterAdminPayload[]) {
  return encounters.map((encounter) => ({
    pokemonName: encounter.pokemon.name,
    pokemonNameGerman: encounter.pokemon.nameGerman ?? undefined,
    spriteUrl: encounter.pokemon.spriteUrl ?? undefined,
    playerName: encounter.player.name,
  }));
}

function emitTeamLinkAdded(encounters: EncounterAdminPayload[], teamSlot: number) {
  emitEvent('team_link_added', {
    routeName: encounters[0]?.route.name,
    teamSlot,
    teamMembers: teamMembersForEvent(encounters),
  });
}

function emitInactiveLinkEvent(
  type: 'pokemon_ko' | 'pokemon_not_caught',
  encounters: EncounterAdminPayload[],
  causedBy: string,
) {
  const causedByMatch = encounters.find((encounter) => encounter.player.name === causedBy);
  const representative = causedByMatch ?? encounters[0];
  emitEvent(type, {
    pokemonName: representative.pokemon.name,
    pokemonNameGerman: representative.pokemon.nameGerman ?? undefined,
    spriteUrl: representative.pokemon.spriteUrl ?? undefined,
    playerName: causedBy,
    routeName: representative.route.name,
  });
}

function teamSlotConflict(routeId: number, routeName: string, teamSlot: number) {
  return {
    ok: false as const,
    status: 409 as const,
    error: `Teamplatz ${teamSlot} ist bereits mit Route „${routeName}“ verknüpft`,
    conflict: { routeId, routeName, teamSlot },
  };
}

function requestedTeamSlot(action: EncounterLinkAdminAction): number | null {
  switch (action.action) {
    case 'set-team-slot':
    case 'take-team-slot':
      return action.teamSlot;
    case 'reactivate':
      return action.teamSlot ?? null;
    default:
      return null;
  }
}

function toConsistencyInput(encounter: EncounterAdminPayload): EncounterLinkConsistencyInput {
  return {
    id: encounter.id,
    routeId: encounter.routeId,
    playerId: encounter.playerId,
    teamSlot: encounter.teamSlot,
    isKnockedOut: encounter.isKnockedOut,
    koCausedBy: encounter.koCausedBy,
    koReason: encounter.koReason,
    koDate: encounter.koDate,
    isNotCaught: encounter.isNotCaught,
    notCaughtBy: encounter.notCaughtBy,
    notCaughtReason: encounter.notCaughtReason,
    notCaughtDate: encounter.notCaughtDate,
  };
}

/**
 * Mutates a complete route link. The server discovers members from routeId;
 * callers never provide encounter IDs.
 */
export async function executeEncounterLinkAdminAction(
  routeId: number,
  action: EncounterLinkAdminAction,
): Promise<EncounterLinkExecutionResult> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.encounter.findMany({
            where: { routeId },
            include: encounterAdminInclude,
            orderBy: { id: 'asc' },
          });

          if (existing.length === 0) {
            return { kind: 'not-found' as const };
          }

          const wasCompletelyOutsideTeam = existing.every(
            (encounter) => encounter.teamSlot === null,
          );
          const occupiedTeamSlots = new Set(
            existing.flatMap((encounter) =>
              encounter.teamSlot === null ? [] : [encounter.teamSlot],
            ),
          );
          const wasAtLeastPartlyInTeam = occupiedTeamSlots.size > 0;
          const previousTeamSlot =
            occupiedTeamSlots.size === 1
              ? occupiedTeamSlots.values().next().value
              : undefined;

          // Explicit deletion is safe even for a corrupt legacy group because
          // deleteMany still removes the link completely and atomically.
          if (action.action === 'delete-link') {
            const deleted = await tx.encounter.deleteMany({ where: { routeId } });
            await bumpLiveRevisions(tx, ['encounters']);
            return { kind: 'deleted' as const, count: deleted.count };
          }

          const targetTeamSlot = requestedTeamSlot(action);
          let displacedRouteId: number | null = null;

          if (targetTeamSlot !== null) {
            const report = auditEncounterLinkGroup(existing.map(toConsistencyInput));
            const blockingIssues = report.issues.filter(
              (issue) => issue.code !== 'mixed-team-slots',
            );
            if (blockingIssues.length > 0) {
              return {
                kind: 'inconsistent' as const,
                issueCodes: blockingIssues.map((issue) => issue.code),
              };
            }
            if (action.action !== 'reactivate' && report.status !== 'active') {
              return { kind: 'inactive' as const };
            }

            // Das Schema hat kein Active-Flag. Daher ist die aktuelle Player-
            // Tabelle die verbindliche aktive Spielerliste.
            const activePlayers = await tx.player.findMany({ select: { id: true } });
            const linkedPlayerIds = new Set(existing.map((encounter) => encounter.playerId));
            const isComplete =
              activePlayers.length > 0 &&
              activePlayers.length === linkedPlayerIds.size &&
              activePlayers.every((player) => linkedPlayerIds.has(player.id));
            if (!isComplete) {
              return {
                kind: 'incomplete' as const,
                linkedCount: linkedPlayerIds.size,
                activeCount: activePlayers.length,
              };
            }

            const occupied = await tx.encounter.findFirst({
              where: {
                teamSlot: targetTeamSlot,
                routeId: { not: routeId },
              },
              select: {
                routeId: true,
                route: { select: { name: true } },
              },
            });
            if (occupied && action.action !== 'take-team-slot') {
              return {
                kind: 'slot-conflict' as const,
                routeId: occupied.routeId,
                routeName: occupied.route.name,
                teamSlot: targetTeamSlot,
              };
            }
            if (occupied) {
              displacedRouteId = occupied.routeId;
              await tx.encounter.updateMany({
                where: { routeId: occupied.routeId },
                data: { teamSlot: previousTeamSlot ?? null },
              });
            }
          }

          const updated = await tx.encounter.updateMany({
            where: { routeId },
            data: buildEncounterLinkUpdate(action),
          });
          const encounters = await tx.encounter.findMany({
            where: { routeId },
            include: encounterAdminInclude,
            orderBy: { id: 'asc' },
          });
          const displaced = displacedRouteId === null
            ? []
            : await tx.encounter.findMany({
                where: { routeId: displacedRouteId },
                include: encounterAdminInclude,
                orderBy: { id: 'asc' },
              });
          await bumpLiveRevisions(tx, ['encounters']);
          return {
            kind: 'updated' as const,
            count: updated.count,
            encounters,
            displaced,
            wasCompletelyOutsideTeam,
            wasAtLeastPartlyInTeam,
            previousTeamSlot,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (result.kind === 'not-found') {
        return { ok: false, status: 404, error: 'Routen-Link nicht gefunden' };
      }
      if (result.kind === 'inconsistent') {
        return {
          ok: false,
          status: 409,
          error: `Routen-Link ist inkonsistent (${result.issueCodes.join(', ')}). Bitte zuerst den Audit prüfen.`,
        };
      }
      if (result.kind === 'inactive') {
        return {
          ok: false,
          status: 409,
          error: 'K.O. oder nicht gefangene Routen-Links müssen zuerst reaktiviert werden',
        };
      }
      if (result.kind === 'incomplete') {
        return {
          ok: false,
          status: 409,
          error: `Teamaufnahme blockiert: Der Routen-Link enthält ${result.linkedCount} von ${result.activeCount} aktiven Spielern.`,
        };
      }
      if (result.kind === 'slot-conflict') {
        return teamSlotConflict(result.routeId, result.routeName, result.teamSlot);
      }

      const response: EncounterLinkAdminResponse = {
        success: true,
        routeId,
        action: action.action,
        count: result.count,
        encounters:
          result.kind === 'deleted'
            ? []
            : [...result.encounters, ...result.displaced].map(serializeEncounterAdminTarget),
      };

      if (
        result.kind === 'updated' &&
        (action.action === 'knockout' || action.action === 'not-caught')
      ) {
        emitInactiveLinkEvent(
          action.action === 'knockout' ? 'pokemon_ko' : 'pokemon_not_caught',
          result.encounters,
          action.causedBy,
        );
      }

      // Beim Tausch bleiben beide Routen im Team; nur eine verdrängte Route geht in die Box.
      if (
        result.kind === 'updated' &&
        action.action === 'take-team-slot' &&
        result.displaced.length > 0 &&
        result.previousTeamSlot === undefined
      ) {
        emitEvent('team_link_boxed', {
          routeName: result.displaced[0].route.name,
          teamSlot: action.teamSlot,
          teamMembers: teamMembersForEvent(result.displaced),
        });
      }

      if (
        result.kind === 'updated' &&
        (action.action === 'set-team-slot' || action.action === 'take-team-slot') &&
        action.teamSlot !== null &&
        result.wasCompletelyOutsideTeam
      ) {
        emitTeamLinkAdded(result.encounters, action.teamSlot);
      }

      if (
        result.kind === 'updated' &&
        action.action === 'set-team-slot' &&
        action.teamSlot === null &&
        result.wasAtLeastPartlyInTeam
      ) {
        emitEvent('team_link_boxed', {
          routeName: result.encounters[0]?.route.name,
          teamSlot: result.previousTeamSlot,
          teamMembers: teamMembersForEvent(result.encounters),
        });
      }

      return { ok: true, response };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        if (attempt < maxRetries) continue;
        return {
          ok: false,
          status: 409,
          error: 'Parallele Link-Änderung erkannt. Bitte erneut versuchen.',
        };
      }
      throw error;
    }
  }

  return {
    ok: false,
    status: 409,
    error: 'Parallele Link-Änderung erkannt. Bitte erneut versuchen.',
  };
}

/**
 * Records a whole catch in one transaction: the Pokémon of every player plus
 * the route's team slot or status. A rejected capture leaves nothing behind.
 */
export async function executeRouteCapture(
  routeId: number,
  { catches, outcome }: RouteCaptureRequest,
): Promise<RouteCaptureExecutionResult> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const route = await tx.route.findUnique({ where: { id: routeId }, select: { id: true } });
          if (!route) return { kind: 'not-found' as const };

          const existing = await tx.encounter.findMany({
            where: { routeId },
            include: encounterAdminInclude,
            orderBy: { id: 'asc' },
          });
          const report = auditEncounterLinkGroup(existing.map(toConsistencyInput));
          if (!report.consistent) {
            return {
              kind: 'inconsistent' as const,
              issueCodes: report.issues.map((issue) => issue.code),
            };
          }
          if (report.status !== 'active' && report.status !== 'empty') {
            return { kind: 'inactive' as const };
          }

          const duplicate = existing.find((encounter) =>
            catches.some((entry) => entry.playerId === encounter.playerId),
          );
          if (duplicate) {
            return { kind: 'duplicate' as const, playerName: duplicate.player.name };
          }

          // Das Schema hat kein Active-Flag. Daher ist die aktuelle Player-
          // Tabelle die verbindliche aktive Spielerliste.
          const activePlayers = await tx.player.findMany({ select: { id: true } });
          const activePlayerIds = new Set(activePlayers.map((player) => player.id));
          if (catches.some((entry) => !activePlayerIds.has(entry.playerId))) {
            return { kind: 'invalid-player' as const };
          }

          const linkedPlayerIds = new Set([
            ...existing.map((encounter) => encounter.playerId),
            ...catches.map((entry) => entry.playerId),
          ]);
          const wasInTeam = report.teamSlot !== null;
          const isComplete = activePlayers.every((player) => linkedPlayerIds.has(player.id));
          if ((outcome.type === 'team' || wasInTeam) && !isComplete) {
            return {
              kind: 'incomplete' as const,
              linkedCount: linkedPlayerIds.size,
              activeCount: activePlayerIds.size,
            };
          }

          if (outcome.type === 'team') {
            const occupied = await tx.encounter.findFirst({
              where: { teamSlot: outcome.teamSlot, routeId: { not: routeId } },
              select: { routeId: true, route: { select: { name: true } } },
            });
            if (occupied) {
              return {
                kind: 'slot-conflict' as const,
                routeId: occupied.routeId,
                routeName: occupied.route.name,
                teamSlot: outcome.teamSlot,
              };
            }
          }

          await tx.encounter.createMany({
            data: catches.map((entry) => ({ ...entry, routeId, teamSlot: report.teamSlot })),
          });
          if (outcome.type === 'team') {
            await tx.encounter.updateMany({
              where: { routeId },
              data: buildEncounterLinkUpdate({ action: 'set-team-slot', teamSlot: outcome.teamSlot }),
            });
          }
          if (outcome.type === 'not-caught') {
            await tx.encounter.updateMany({
              where: { routeId },
              data: buildEncounterLinkUpdate({
                action: 'not-caught',
                causedBy: outcome.causedBy,
                reason: outcome.reason,
              }),
            });
          }

          const encounters = await tx.encounter.findMany({
            where: { routeId },
            include: encounterAdminInclude,
            orderBy: { id: 'asc' },
          });
          await bumpLiveRevisions(tx, ['encounters']);
          return { kind: 'captured' as const, encounters, wasInTeam };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      switch (result.kind) {
        case 'not-found':
          return { ok: false, status: 404, error: 'Route nicht gefunden' };
        case 'inconsistent':
          return {
            ok: false,
            status: 409,
            error: `Route ist inkonsistent (${result.issueCodes.join(', ')}). Es wurde nichts gespeichert.`,
          };
        case 'inactive':
          return {
            ok: false,
            status: 409,
            error: 'K.O. oder nicht gefangene Routen müssen zuerst reaktiviert werden',
          };
        case 'duplicate':
          return {
            ok: false,
            status: 409,
            error: `${result.playerName} hat auf dieser Route bereits ein Pokémon erfasst. Es wurde nichts gespeichert.`,
          };
        case 'invalid-player':
          return { ok: false, status: 400, error: 'Ungültige Spieler-ID' };
        case 'incomplete':
          return {
            ok: false,
            status: 409,
            error: `Teamaufnahme blockiert: Die Route enthält ${result.linkedCount} von ${result.activeCount} aktiven Spielern.`,
          };
        case 'slot-conflict':
          return teamSlotConflict(result.routeId, result.routeName, result.teamSlot);
      }

      if (outcome.type === 'team' && !result.wasInTeam) {
        emitTeamLinkAdded(result.encounters, outcome.teamSlot);
      }
      if (outcome.type === 'not-caught') {
        emitInactiveLinkEvent('pokemon_not_caught', result.encounters, outcome.causedBy);
      }

      return {
        ok: true,
        response: {
          success: true,
          routeId,
          outcome: outcome.type,
          created: catches.length,
          encounters: result.encounters.map(serializeEncounterAdminTarget),
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < maxRetries) continue;
        if (error.code === 'P2034' || error.code === 'P2002') {
          return {
            ok: false,
            status: 409,
            error: 'Parallele Änderung erkannt. Bitte erneut versuchen.',
          };
        }
        if (error.code === 'P2003') {
          return { ok: false, status: 400, error: 'Ungültige Pokémon-ID' };
        }
      }
      throw error;
    }
  }

  return { ok: false, status: 409, error: 'Parallele Änderung erkannt. Bitte erneut versuchen.' };
}

/** Read-only consistency report. It never changes production data. */
export async function getEncounterLinkAudit(): Promise<EncounterLinkAuditResponse> {
  const [players, encounters] = await Promise.all([
    prisma.player.findMany({ select: { id: true } }),
    prisma.encounter.findMany({
      select: {
        id: true,
        routeId: true,
        playerId: true,
        teamSlot: true,
        isKnockedOut: true,
        koCausedBy: true,
        koReason: true,
        koDate: true,
        isNotCaught: true,
        notCaughtBy: true,
        notCaughtReason: true,
        notCaughtDate: true,
        route: { select: { name: true } },
      },
      orderBy: [{ routeId: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const activePlayerIds = players.map((player) => player.id);
  const grouped = new Map<number, typeof encounters>();
  for (const encounter of encounters) {
    const group = grouped.get(encounter.routeId) ?? [];
    group.push(encounter);
    grouped.set(encounter.routeId, group);
  }

  const links = Array.from(grouped.entries()).map(([routeId, group]) => ({
    ...auditEncounterLinkGroup(group, activePlayerIds),
    routeId,
    routeName: group[0].route.name,
  }));
  const consistent = links.filter((link) => link.consistent).length;

  return {
    success: true,
    summary: {
      routeLinks: links.length,
      consistent,
      inconsistent: links.length - consistent,
    },
    links,
  };
}
