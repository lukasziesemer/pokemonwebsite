/**
 * Admin API: Nächsten Run starten
 * POST /api/admin/runs/next
 * Bewahrt Spieler und Routen, leert aber die Begegnungen des beendeten Runs.
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import {
  withAdminAuthAndErrorHandling,
  success,
  badRequest,
  conflict,
} from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { bumpLiveRevisions } from '@/lib/live-updates.server';

interface NextRunBody {
  gameVersionKey?: string | null;
}

export async function POST(request: NextRequest) {
  return withAdminAuthAndErrorHandling(async () => {
    const body: NextRunBody = await request.json().catch(() => ({}));
    const requestedVersionKey = body.gameVersionKey?.trim() || null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const activeRun = await tx.run.findFirst({
              where: { status: 'active' },
              select: { id: true },
            });

            if (activeRun) return { kind: 'active-run' as const };

            const latestRun = await tx.run.findFirst({
              where: {
                archived: false,
                status: { in: ['failed', 'completed'] },
              },
              orderBy: { id: 'desc' },
            });

            if (!latestRun) return { kind: 'missing-finished-run' as const };

            const effectiveVersionKey =
              requestedVersionKey ?? latestRun.gameVersionKey;
            const isVersionChange =
              effectiveVersionKey !== latestRun.gameVersionKey;

            // Der Sieger- bzw. Abschlussstand bleibt im Run-Snapshot erhalten.
            // Nur die Live-Begegnungen werden für den nächsten Versuch geleert.
            await tx.encounter.deleteMany({});

            let nextRunNumber: number;
            if (isVersionChange) {
              await tx.run.updateMany({
                where: { archived: false },
                data: { archived: true },
              });
              nextRunNumber = 1;
            } else {
              const lastRun = await tx.run.findFirst({
                where: { archived: false },
                orderBy: { runNumber: 'desc' },
                select: { runNumber: true },
              });
              nextRunNumber = (lastRun?.runNumber ?? 0) + 1;
            }

            const newRun = await tx.run.create({
              data: {
                runNumber: nextRunNumber,
                gameVersionKey: effectiveVersionKey,
                status: 'active',
              },
              include: { gameVersion: true },
            });

            await bumpLiveRevisions(tx, ['runs', 'encounters']);

            return { kind: 'created' as const, newRun };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );

        if (result.kind === 'active-run') {
          return badRequest(
            'Es existiert bereits ein aktiver Run. Bitte beende diesen zuerst.'
          );
        }

        if (result.kind === 'missing-finished-run') {
          return badRequest('Es gibt keinen beendeten Run als Ausgangspunkt');
        }

        return success({
          message: `Run #${result.newRun.runNumber} wurde gestartet. Spieler und Routen bleiben erhalten.`,
          newRun: result.newRun,
        });
      } catch (error) {
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
  }, 'starting next run');
}
