import prisma from '@/lib/prisma';
import {
  buildOpenRoutes,
  buildRecentEvents,
  type AdminDashboardData,
  type AdminDashboardEncounter,
  type AdminDashboardInventory,
  type AdminDashboardPlayer,
  type AdminDashboardRun,
} from './dashboard-model';

const ENCOUNTER_SELECT = {
  id: true,
  nickname: true,
  teamSlot: true,
  createdAt: true,
  isKnockedOut: true,
  koCausedBy: true,
  koReason: true,
  koDate: true,
  isNotCaught: true,
  notCaughtBy: true,
  notCaughtReason: true,
  notCaughtDate: true,
  player: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  pokemon: {
    select: {
      pokedexId: true,
      name: true,
      nameGerman: true,
      spriteUrl: true,
    },
  },
  route: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const MAX_OPEN_ROUTES = 8;

function logSectionFailure(section: string, reason: unknown) {
  console.error(`Admin dashboard: ${section} konnte nicht geladen werden`, reason);
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const activeRunPromise = Promise.all([
    prisma.run.findFirst({
      where: { status: 'active', archived: false },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        runNumber: true,
        startedAt: true,
        pausedAt: true,
        badgesEarned: true,
        gameVersion: {
          select: {
            key: true,
            name: true,
            generation: true,
          },
        },
      },
    }),
    prisma.run.count({ where: { status: 'active', archived: false } }),
  ]);

  const playersPromise = prisma.player.findMany({
    select: {
      id: true,
      name: true,
      color: true,
      encounters: {
        where: {
          teamSlot: { not: null },
          isKnockedOut: false,
          isNotCaught: false,
        },
        select: {
          id: true,
          nickname: true,
          teamSlot: true,
          pokemon: {
            select: {
              pokedexId: true,
              name: true,
              nameGerman: true,
              spriteUrl: true,
            },
          },
          route: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { teamSlot: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const assignmentsPromise = prisma.encounter.findMany({
    where: {
      teamSlot: null,
      isKnockedOut: false,
      isNotCaught: false,
    },
    select: ENCOUNTER_SELECT,
    orderBy: [{ route: { order: 'asc' } }, { id: 'asc' }],
  });

  const eventsPromise = Promise.all([
    prisma.encounter.findMany({
      where: { isKnockedOut: true },
      select: ENCOUNTER_SELECT,
      orderBy: { koDate: 'desc' },
      take: 8,
    }),
    prisma.encounter.findMany({
      where: { isNotCaught: true },
      select: ENCOUNTER_SELECT,
      orderBy: { notCaughtDate: 'desc' },
      take: 8,
    }),
    prisma.encounter.findMany({
      select: ENCOUNTER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.encounter.count({
      where: { isKnockedOut: true, koDate: null },
    }),
    prisma.encounter.count({
      where: { isNotCaught: true, notCaughtDate: null },
    }),
  ]);

  const inventoryPromise = Promise.all([
    prisma.player.count(),
    prisma.route.count(),
    prisma.encounter.count(),
    prisma.pokemon.count(),
  ]);

  const [runResult, playersResult, assignmentsResult, eventsResult, inventoryResult] =
    await Promise.allSettled([
      activeRunPromise,
      playersPromise,
      assignmentsPromise,
      eventsPromise,
      inventoryPromise,
    ]);

  const warnings: string[] = [];

  let activeRun: AdminDashboardRun | null = null;
  let activeRunCount: number | null = null;
  if (runResult.status === 'fulfilled') {
    activeRun = runResult.value[0];
    activeRunCount = runResult.value[1];
    if (activeRunCount > 1) {
      warnings.push(`${activeRunCount} aktive Runs gefunden. Erwartet wird genau einer.`);
    }
  } else {
    warnings.push('Der aktuelle Run konnte nicht geladen werden.');
    logSectionFailure('aktueller Run', runResult.reason);
  }

  let players: AdminDashboardPlayer[] = [];
  if (playersResult.status === 'fulfilled') {
    players = playersResult.value.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      teamMembers: player.encounters,
    }));
  } else {
    warnings.push('Die Teambelegung konnte nicht geladen werden.');
    logSectionFailure('Teambelegung', playersResult.reason);
  }

  let openRouteCount: number | null = null;
  let openRoutes: AdminDashboardData['openRoutes'] = [];
  if (assignmentsResult.status === 'fulfilled') {
    const allOpenRoutes = buildOpenRoutes(assignmentsResult.value, players.length);
    openRouteCount = allOpenRoutes.length;
    openRoutes = allOpenRoutes.slice(0, MAX_OPEN_ROUTES);
  } else {
    warnings.push('Offene Teamzuweisungen konnten nicht geladen werden.');
    logSectionFailure('offene Teamzuweisungen', assignmentsResult.reason);
  }

  let recentEvents = [] as AdminDashboardData['recentEvents'];
  let eventDateGaps: AdminDashboardData['eventDateGaps'] = null;
  if (eventsResult.status === 'fulfilled') {
    const [knockedOut, notCaught, created, knockedOutWithoutDate, notCaughtWithoutDate] =
      eventsResult.value;
    const uniqueEncounters = new Map<number, AdminDashboardEncounter>();

    for (const encounter of [...knockedOut, ...notCaught, ...created]) {
      uniqueEncounters.set(encounter.id, encounter);
    }

    recentEvents = buildRecentEvents(Array.from(uniqueEncounters.values()));
    eventDateGaps = {
      knockedOut: knockedOutWithoutDate,
      notCaught: notCaughtWithoutDate,
    };
  } else {
    warnings.push('Die letzten Ereignisse konnten nicht geladen werden.');
    logSectionFailure('letzte Ereignisse', eventsResult.reason);
  }

  let inventory: AdminDashboardInventory = {
    players: null,
    routes: null,
    encounters: null,
    pokemon: null,
  };
  if (inventoryResult.status === 'fulfilled') {
    inventory = {
      players: inventoryResult.value[0],
      routes: inventoryResult.value[1],
      encounters: inventoryResult.value[2],
      pokemon: inventoryResult.value[3],
    };
  } else {
    warnings.push('Der Datenbestand konnte nicht vollständig gezählt werden.');
    logSectionFailure('Datenbestand', inventoryResult.reason);
  }

  return {
    activeRun,
    activeRunAvailable: runResult.status === 'fulfilled',
    activeRunCount,
    players,
    teamsAvailable: playersResult.status === 'fulfilled',
    openRoutes,
    openRouteCount,
    assignmentsAvailable: assignmentsResult.status === 'fulfilled',
    recentEvents,
    eventsAvailable: eventsResult.status === 'fulfilled',
    eventDateGaps,
    inventory,
    updatedAt: new Date(),
    warnings,
  };
}
