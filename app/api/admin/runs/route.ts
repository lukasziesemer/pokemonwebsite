/**
 * Admin API: Runs
 * GET /api/admin/runs - Alle Runs abrufen (aktueller + historische)
 * POST /api/admin/runs - Neuen Run starten
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { withAdminAuthAndErrorHandling, success, badRequest, conflict } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { bumpLiveRevisions } from '@/lib/live-updates.server';

export async function GET() {
  return withAdminAuthAndErrorHandling(async () => {
    const runs = await prisma.run.findMany({
      where: { archived: false },
      include: {
        gameVersion: true,
        playerStats: true,
      },
      orderBy: { runNumber: 'desc' },
    });

    // Finde den aktiven Run
    const activeRun = runs.find(r => r.status === 'active');
    const historicalRuns = runs.filter(r => r.status !== 'active');

    return success({
      activeRun,
      historicalRuns,
      totalRuns: runs.length,
      failedRuns: runs.filter(r => r.status === 'failed').length,
      completedRuns: runs.filter(r => r.status === 'completed').length,
    });
  }, 'fetching runs');
}

export async function POST(request: NextRequest) {
  return withAdminAuthAndErrorHandling(async () => {
    const body = await request.json();
    const { gameVersionKey } = body;

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const run = await prisma.$transaction(
          async (tx) => {
            // Prüfe atomar innerhalb derselben Transaktion
            const existingActiveRun = await tx.run.findFirst({
              where: { status: 'active' },
            });

            if (existingActiveRun) {
              return null;
            }

            // Letzten nicht-archivierten Run ermitteln
            const lastRun = await tx.run.findFirst({
              where: { archived: false },
              orderBy: { id: 'desc' },
            });

            let nextRunNumber: number;

            if (gameVersionKey && lastRun && lastRun.gameVersionKey !== gameVersionKey) {
              // Versionswechsel → alle nicht-archivierten Runs archivieren
              await tx.run.updateMany({
                where: { archived: false },
                data: { archived: true },
              });
              nextRunNumber = 1;
            } else {
              // Gleiche Version → RunNumber inkrementieren
              const lastSameVersion = await tx.run.findFirst({
                where: { archived: false },
                orderBy: { runNumber: 'desc' },
              });
              nextRunNumber = (lastSameVersion?.runNumber ?? 0) + 1;
            }

            const createdRun = await tx.run.create({
              data: {
                runNumber: nextRunNumber,
                gameVersionKey: gameVersionKey || null,
                status: 'active',
              },
              include: {
                gameVersion: true,
              },
            });
            await bumpLiveRevisions(tx, ['runs']);
            return createdRun;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );

        if (!run) {
          return badRequest(
            'Es existiert bereits ein aktiver Run. Bitte beende diesen zuerst.'
          );
        }

        return success(run);
      } catch (error) {
        // Bei Serialisierungs-Konflikten kurz retryen
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt === maxRetries) {
            return conflict(
              'Konflikt durch parallele Anfrage. Bitte erneut versuchen.'
            );
          }
          continue;
        }
        throw error;
      }
    }

    return conflict('Konflikt durch parallele Anfrage. Bitte erneut versuchen.');
  }, 'creating run');
}
