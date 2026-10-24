import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import {
  LIVE_UPDATE_TOPICS,
  ZERO_LIVE_REVISIONS,
  type LiveRevisions,
  type LiveUpdateTopic,
} from '@/lib/live-updates';

interface LiveRevisionDatabase {
  liveRevision: {
    upsert(args: Prisma.LiveRevisionUpsertArgs): Promise<unknown>;
  };
}

function uniqueTopics(topics: readonly LiveUpdateTopic[]): LiveUpdateTopic[] {
  return Array.from(new Set(topics));
}

/**
 * Bumps all supplied topics atomically when called with a transaction client.
 * `upsert` also makes first-run deployments safe: missing topics start at 1.
 */
export async function bumpLiveRevisions(
  db: LiveRevisionDatabase,
  topics: readonly LiveUpdateTopic[],
): Promise<void> {
  for (const topic of uniqueTopics(topics)) {
    await db.liveRevision.upsert({
      where: { topic },
      create: { topic, revision: BigInt(1) },
      update: { revision: { increment: BigInt(1) } },
    });
  }
}

/** Returns every known topic as a JSON-safe decimal string. */
export async function getLiveRevisions(): Promise<LiveRevisions> {
  const rows = await prisma.liveRevision.findMany({
    where: { topic: { in: [...LIVE_UPDATE_TOPICS] } },
    select: { topic: true, revision: true },
  });

  const revisions: LiveRevisions = { ...ZERO_LIVE_REVISIONS };
  for (const row of rows) {
    if ((LIVE_UPDATE_TOPICS as readonly string[]).includes(row.topic)) {
      revisions[row.topic as LiveUpdateTopic] = row.revision.toString();
    }
  }
  return revisions;
}
