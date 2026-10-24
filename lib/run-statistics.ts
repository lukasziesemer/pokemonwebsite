import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export interface GameVersionInfo {
  key: string;
  name: string;
  generation: number;
}

export interface RunScope {
  type: 'all' | 'game' | 'unknown';
  gameKey: string | null;
  label: string;
}

export interface EncounterCounts {
  encounters: number;
  caught: number;
  knockedOut: number;
  notCaught: number;
}

interface DurationRun {
  startedAt: Date;
  endedAt: Date | null;
  pausedAt: Date | null;
  totalPausedMs: number;
}

interface CountedRun {
  id: number;
  status: string;
}

const EMPTY_COUNTS: EncounterCounts = {
  encounters: 0,
  caught: 0,
  knockedOut: 0,
  notCaught: 0,
};

export async function resolveRunScope(rawGame: string | null): Promise<RunScope | null> {
  const game = rawGame?.trim() || 'all';

  if (game === 'all') {
    return { type: 'all', gameKey: null, label: 'Alle Spiele' };
  }

  if (game === 'unknown') {
    return { type: 'unknown', gameKey: null, label: 'Ohne Spielversion' };
  }

  const gameVersion = await prisma.gameVersion.findUnique({
    where: { key: game },
    select: { key: true, name: true },
  });

  if (!gameVersion) {
    return null;
  }

  return {
    type: 'game',
    gameKey: gameVersion.key,
    label: gameVersion.name,
  };
}

export function runWhereForScope(scope: RunScope): Prisma.RunWhereInput {
  if (scope.type === 'game') {
    return { gameVersionKey: scope.gameKey };
  }

  if (scope.type === 'unknown') {
    return { gameVersionKey: null };
  }

  return {};
}

export function calculateRunDurationMs(run: DurationRun, now = new Date()): number {
  const effectiveEnd = run.endedAt ?? now;
  const openPauseMs = run.pausedAt
    ? Math.max(0, effectiveEnd.getTime() - run.pausedAt.getTime())
    : 0;

  return Math.max(
    0,
    effectiveEnd.getTime() - run.startedAt.getTime() - run.totalPausedMs - openPauseMs
  );
}

export async function loadEncounterCountsByRun(
  runs: CountedRun[]
): Promise<Map<number, EncounterCounts>> {
  const counts = new Map<number, EncounterCounts>();
  const historicalRunIds = runs.filter(run => run.status !== 'active').map(run => run.id);
  const activeRunIds = runs.filter(run => run.status === 'active').map(run => run.id);

  const [historicalEncounters, currentEncounters] = await Promise.all([
    historicalRunIds.length > 0
      ? prisma.runEncounter.findMany({
          where: { runId: { in: historicalRunIds } },
          select: { runId: true, isKnockedOut: true, isNotCaught: true },
        })
      : Promise.resolve([]),
    activeRunIds.length > 0
      ? prisma.encounter.findMany({
          select: { isKnockedOut: true, isNotCaught: true },
        })
      : Promise.resolve([]),
  ]);

  for (const encounter of historicalEncounters) {
    const current = counts.get(encounter.runId) ?? { ...EMPTY_COUNTS };
    current.encounters += 1;
    current.caught += encounter.isNotCaught ? 0 : 1;
    current.knockedOut += encounter.isKnockedOut ? 1 : 0;
    current.notCaught += encounter.isNotCaught ? 1 : 0;
    counts.set(encounter.runId, current);
  }

  if (activeRunIds.length > 0) {
    const liveCounts = { ...EMPTY_COUNTS };
    for (const encounter of currentEncounters) {
      liveCounts.encounters += 1;
      liveCounts.caught += encounter.isNotCaught ? 0 : 1;
      liveCounts.knockedOut += encounter.isKnockedOut ? 1 : 0;
      liveCounts.notCaught += encounter.isNotCaught ? 1 : 0;
    }

    // Das Datenmodell kennt genau einen globalen Encounter-Satz. Im Normalbetrieb
    // existiert daher auch nur ein aktiver Run. Bei inkonsistenten Altdaten ordnen
    // wir ihn dem neuesten aktiven Run zu, statt Zahlen mehrfach zu zählen.
    const liveRunId = activeRunIds[0];
    counts.set(liveRunId, liveCounts);
  }

  for (const run of runs) {
    if (!counts.has(run.id)) {
      counts.set(run.id, { ...EMPTY_COUNTS });
    }
  }

  return counts;
}

export function emptyEncounterCounts(): EncounterCounts {
  return { ...EMPTY_COUNTS };
}
