/**
 * Admin API: Encounters CRUD
 * GET /api/admin/encounters - Liste aller Encounters
 * POST /api/admin/encounters - Neuen Encounter erstellen
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import {
  withAdminAuthAndErrorHandling,
  validateRequired,
  parseId,
  badRequest,
  created,
  conflict,
} from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { auditEncounterLinkGroup } from '@/lib/encounter-link-admin';
import { bumpLiveRevisions } from '@/lib/live-updates.server';


// GET: Alle Encounters abrufen
export async function GET() {
  return withAdminAuthAndErrorHandling(async () => {
    const encounters = await prisma.encounter.findMany({
      include: {
        player: true,
        route: true,
        pokemon: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(encounters);
  }, 'fetching encounters');
}

// POST: Neuen Encounter erstellen
export async function POST(request: NextRequest) {
  return withAdminAuthAndErrorHandling(async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return badRequest('Der Request-Body muss gültiges JSON enthalten');
    }
    const { playerId, routeId, pokemonId, nickname } = body;

    // Validierung
    try {
      validateRequired(body, ['playerId', 'routeId', 'pokemonId']);
    } catch (error) {
      return badRequest(
        error instanceof Error
          ? error.message
          : 'Spieler, Route und Pokémon sind erforderlich'
      );
    }

    // IDs parsen
    let parsedPlayerId: number;
    let parsedRouteId: number;
    let parsedPokemonId: number;

    try {
      parsedPlayerId = parseId(String(playerId), 'Spieler-ID');
      parsedRouteId = parseId(String(routeId), 'Routen-ID');
      parsedPokemonId = parseId(String(pokemonId), 'Pokémon-ID');
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'Ungültige ID');
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const [existingEncounter, existingLink] = await Promise.all([
              tx.encounter.findFirst({
                where: { playerId: parsedPlayerId, routeId: parsedRouteId },
                include: { pokemon: true, route: true },
              }),
              tx.encounter.findMany({
                where: { routeId: parsedRouteId },
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
                },
                orderBy: { id: 'asc' },
              }),
            ]);

            if (existingEncounter) {
              return { kind: 'duplicate' as const, encounter: existingEncounter };
            }

            const inherited = existingLink[0] ?? null;
            if (inherited) {
              const report = auditEncounterLinkGroup(existingLink);
              if (!report.consistent) {
                return {
                  kind: 'inconsistent' as const,
                  issueCodes: report.issues.map((issue) => issue.code),
                };
              }

              if (inherited.teamSlot !== null) {
                // Ohne Active-Flag bildet die Player-Tabelle die aktive Runde ab.
                const activePlayers = await tx.player.findMany({ select: { id: true } });
                const activePlayerIds = new Set(activePlayers.map((player) => player.id));
                if (!activePlayerIds.has(parsedPlayerId)) {
                  return { kind: 'invalid-player' as const };
                }
                const resultingPlayers = new Set(existingLink.map((encounter) => encounter.playerId));
                resultingPlayers.add(parsedPlayerId);
                const isComplete =
                  activePlayers.length > 0 &&
                  resultingPlayers.size === activePlayers.length &&
                  activePlayers.every((player) => resultingPlayers.has(player.id));
                if (!isComplete) {
                  return {
                    kind: 'incomplete-team-link' as const,
                    linkedCount: resultingPlayers.size,
                    activeCount: activePlayers.length,
                  };
                }
              }
            }

            const encounter = await tx.encounter.create({
              data: {
                playerId: parsedPlayerId,
                routeId: parsedRouteId,
                pokemonId: parsedPokemonId,
                nickname: nickname ? String(nickname).trim() : null,
                teamSlot: inherited?.teamSlot ?? null,
                isKnockedOut: inherited?.isKnockedOut ?? false,
                koCausedBy: inherited?.koCausedBy ?? null,
                koReason: inherited?.koReason ?? null,
                koDate: inherited?.koDate ?? null,
                isNotCaught: inherited?.isNotCaught ?? false,
                notCaughtBy: inherited?.notCaughtBy ?? null,
                notCaughtReason: inherited?.notCaughtReason ?? null,
                notCaughtDate: inherited?.notCaughtDate ?? null,
              },
              include: { player: true, route: true, pokemon: true },
            });
            await bumpLiveRevisions(tx, ['encounters']);
            return { kind: 'created' as const, encounter };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        if (result.kind === 'duplicate') {
          const pokemonName =
            result.encounter.pokemon.nameGerman || result.encounter.pokemon.name;
          return conflict(
            `Dieser Spieler hat bereits ein Pokémon auf dieser Route gefangen: ${pokemonName} auf ${result.encounter.route.name}. Jeder Spieler darf nur 1 Pokémon pro Route fangen.`,
          );
        }
        if (result.kind === 'inconsistent') {
          return conflict(
            `Routen-Link ist inkonsistent (${result.issueCodes.join(', ')}). Neuer Encounter wurde nicht angelegt.`,
          );
        }
        if (result.kind === 'invalid-player') {
          return badRequest('Ungültige Spieler-ID');
        }
        if (result.kind === 'incomplete-team-link') {
          return conflict(
            `Team-Link bleibt unvollständig (${result.linkedCount} von ${result.activeCount} aktiven Spielern). Encounter wurde nicht angelegt.`,
          );
        }
        return created(result.encounter);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < maxRetries) continue;
          return conflict('Parallele Link-Änderung erkannt. Bitte erneut versuchen.');
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          return badRequest('Ungültige Spieler-, Routen- oder Pokémon-ID');
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return conflict(
            'Dieser Spieler hat bereits ein Pokémon auf dieser Route gefangen. Jeder Spieler darf nur 1 Pokémon pro Route fangen.',
          );
        }
        throw error;
      }
    }

    return conflict('Parallele Link-Änderung erkannt. Bitte erneut versuchen.');
  }, 'creating encounter');
}

