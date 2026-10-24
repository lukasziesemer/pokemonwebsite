/**
 * Admin API: Letzten Run-Abschluss rückgängig machen
 * POST /api/admin/runs/[id]/reopen
 */

import { Prisma } from '@/generated/prisma/client';
import {
  withAdminAuthAndErrorHandling,
  success,
  badRequest,
  conflict,
  notFound,
  parseId,
} from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { bumpLiveRevisions } from '@/lib/live-updates.server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdminAuthAndErrorHandling(async () => {
    const { id } = await params;
    const runId = parseId(id, 'Run-ID');
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const targetRun = await tx.run.findUnique({
              where: { id: runId },
            });

            if (!targetRun) return { kind: 'not-found' as const };
            if (!['failed', 'completed'].includes(targetRun.status)) {
              return { kind: 'not-finished' as const };
            }

            const activeRun = await tx.run.findFirst({
              where: { status: 'active' },
              select: { id: true },
            });
            if (activeRun) return { kind: 'active-run' as const };

            const latestRun = await tx.run.findFirst({
              where: { archived: false },
              orderBy: { id: 'desc' },
              select: { id: true },
            });
            if (latestRun?.id !== runId) return { kind: 'not-latest' as const };

            await tx.runEncounter.deleteMany({ where: { runId } });
            await tx.runPlayerStats.deleteMany({ where: { runId } });

            const reopenedRun = await tx.run.update({
              where: { id: runId },
              data: {
                status: 'active',
                loserPlayerName: null,
                endedAt: null,
              },
              include: { gameVersion: true },
            });

            await bumpLiveRevisions(tx, ['runs']);

            return { kind: 'reopened' as const, reopenedRun };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );

        if (result.kind === 'not-found') return notFound('Run nicht gefunden');
        if (result.kind === 'not-finished') {
          return badRequest('Nur ein beendeter Run kann wieder geöffnet werden');
        }
        if (result.kind === 'active-run') {
          return conflict('Es existiert bereits ein aktiver Run');
        }
        if (result.kind === 'not-latest') {
          return conflict(
            'Nur der zuletzt beendete Run kann wieder geöffnet werden'
          );
        }

        return success({
          message: `Run #${result.reopenedRun.runNumber} ist wieder aktiv.`,
          run: result.reopenedRun,
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
  }, 'reopening run');
}
