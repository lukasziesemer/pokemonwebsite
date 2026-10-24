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

          if (action.action === 'set-team-slot' && action.teamSlot !== null) {
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
            if (report.status !== 'active') {
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
                teamSlot: action.teamSlot,
                routeId: { not: routeId },
              },
              select: {
                routeId: true,
                route: { select: { name: true } },
              },
            });
            if (occupied) {
              return {
                kind: 'slot-conflict' as const,
                routeId: occupied.routeId,
                routeName: occupied.route.name,
                teamSlot: action.teamSlot,
              };
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
          await bumpLiveRevisions(tx, ['encounters']);
          return {
            kind: 'updated' as const,
            count: updated.count,
            encounters,
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
        return {
          ok: false,
          status: 409,
          error: `Teamplatz ${result.teamSlot} ist bereits mit Route „${result.routeName}“ verknüpft`,
          conflict: {
            routeId: result.routeId,
            routeName: result.routeName,
            teamSlot: result.teamSlot,
          },
        };
      }

      const response: EncounterLinkAdminResponse = {
        success: true,
        routeId,
        action: action.action,
        count: result.count,
        encounters:
          result.kind === 'deleted'
            ? []
            : result.encounters.map(serializeEncounterAdminTarget),
      };

      if (
        result.kind === 'updated' &&
        (action.action === 'knockout' || action.action === 'not-caught')
      ) {
        const causedByMatch = result.encounters.find(
          (encounter) => encounter.player.name === action.causedBy,
        );
        const representative = causedByMatch ?? result.encounters[0];
        emitEvent(action.action === 'knockout' ? 'pokemon_ko' : 'pokemon_not_caught', {
          pokemonName: representative.pokemon.name,
          pokemonNameGerman: representative.pokemon.nameGerman ?? undefined,
          spriteUrl: representative.pokemon.spriteUrl ?? undefined,
          playerName: action.causedBy,
          routeName: representative.route.name,
        });
      }

      if (
        result.kind === 'updated' &&
        action.action === 'set-team-slot' &&
        action.teamSlot !== null &&
        result.wasCompletelyOutsideTeam
      ) {
        emitEvent('team_link_added', {
          routeName: result.encounters[0]?.route.name,
          teamSlot: action.teamSlot,
          teamMembers: result.encounters.map((encounter) => ({
            pokemonName: encounter.pokemon.name,
            pokemonNameGerman: encounter.pokemon.nameGerman ?? undefined,
            spriteUrl: encounter.pokemon.spriteUrl ?? undefined,
            playerName: encounter.player.name,
          })),
        });
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
          teamMembers: result.encounters.map((encounter) => ({
            pokemonName: encounter.pokemon.name,
            pokemonNameGerman: encounter.pokemon.nameGerman ?? undefined,
            spriteUrl: encounter.pokemon.spriteUrl ?? undefined,
            playerName: encounter.player.name,
          })),
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
