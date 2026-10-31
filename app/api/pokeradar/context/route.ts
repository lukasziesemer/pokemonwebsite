import { NextResponse } from 'next/server';
import { getLevelCapsForGame } from '@/lib/badge-data';
import { getKnownGameVersion } from '@/lib/game-versions';
import {
  EMPTY_COMPARISON_RUN_CONTEXT,
  type ComparisonRunContext,
} from '@/lib/pokeradar-context';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const select = {
      id: true,
      badgesEarned: true,
      gameVersionKey: true,
      gameVersion: { select: { name: true } },
    } as const;
    const [activeRun, latestRun] = await Promise.all([
      prisma.run.findFirst({
        where: { archived: false, status: 'active' },
        select,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.run.findFirst({
        where: { archived: false },
        select,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const run = activeRun ?? latestRun;
    let context = EMPTY_COMPARISON_RUN_CONTEXT;
    if (run) {
      const knownVersion = getKnownGameVersion(run.gameVersionKey);
      const levelCaps = run.gameVersionKey ? getLevelCapsForGame(run.gameVersionKey) : null;
      context = {
        gameVersionKey: run.gameVersionKey,
        gameVersionName: run.gameVersion?.name ?? knownVersion?.name ?? null,
        levelCap: levelCaps?.[run.badgesEarned] ?? null,
        runId: run.id,
      } satisfies ComparisonRunContext;
    }

    return NextResponse.json(context, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Vergleichs-Kontext konnte nicht geladen werden:', error);
    return NextResponse.json(
      { error: 'Die Edition des aktuellen Runs konnte nicht geladen werden.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
