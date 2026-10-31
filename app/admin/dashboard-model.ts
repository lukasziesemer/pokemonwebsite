export const TEAM_SIZE = 6;

export interface AdminDashboardPokemon {
  pokedexId: number;
  name: string;
  nameGerman: string | null;
  spriteUrl: string | null;
}

export interface AdminDashboardTeamMember {
  id: number;
  nickname: string | null;
  teamSlot: number | null;
  pokemon: AdminDashboardPokemon;
  route: {
    id: number;
    name: string;
  };
}

export interface AdminDashboardPlayer {
  id: number;
  name: string;
  color: string;
  teamMembers: AdminDashboardTeamMember[];
}

export interface AdminDashboardRun {
  id: number;
  runNumber: number;
  startedAt: Date;
  pausedAt: Date | null;
  badgesEarned: number;
  gameVersion: {
    key: string;
    name: string;
    generation: number;
  } | null;
}

export interface AdminDashboardEncounter {
  id: number;
  nickname: string | null;
  teamSlot: number | null;
  createdAt: Date;
  isKnockedOut: boolean;
  koCausedBy: string | null;
  koReason: string | null;
  koDate: Date | null;
  isNotCaught: boolean;
  notCaughtBy: string | null;
  notCaughtReason: string | null;
  notCaughtDate: Date | null;
  player: {
    id: number;
    name: string;
    color: string;
  };
  pokemon: AdminDashboardPokemon;
  route: {
    id: number;
    name: string;
  };
}

/** Aktive Route ohne Teamplatz; eine Teamentscheidung gilt immer für die ganze Route. */
export interface AdminDashboardOpenRoute {
  routeId: number;
  routeName: string;
  encounters: AdminDashboardEncounter[];
  isComplete: boolean;
}

export type AdminDashboardEventType =
  | 'knocked_out'
  | 'not_caught'
  | 'encounter_created';

export interface AdminDashboardEvent {
  id: string;
  type: AdminDashboardEventType;
  occurredAt: Date | null;
  player: AdminDashboardEncounter['player'];
  pokemon: AdminDashboardPokemon;
  route: AdminDashboardEncounter['route'];
  nickname: string | null;
  causedBy: string | null;
  reason: string | null;
}

export interface AdminDashboardInventory {
  players: number | null;
  routes: number | null;
  encounters: number | null;
  pokemon: number | null;
}

export interface AdminDashboardData {
  activeRun: AdminDashboardRun | null;
  activeRunAvailable: boolean;
  activeRunCount: number | null;
  players: AdminDashboardPlayer[];
  teamsAvailable: boolean;
  openRoutes: AdminDashboardOpenRoute[];
  openRouteCount: number | null;
  assignmentsAvailable: boolean;
  recentEvents: AdminDashboardEvent[];
  eventsAvailable: boolean;
  eventDateGaps: {
    knockedOut: number;
    notCaught: number;
  } | null;
  inventory: AdminDashboardInventory;
  updatedAt: Date;
  warnings: string[];
}

export function getPokemonDisplayName(pokemon: AdminDashboardPokemon): string {
  return pokemon.nameGerman || pokemon.name;
}

export function getPlayerTeamSummary(player: AdminDashboardPlayer) {
  const membersBySlot = new Map<number, AdminDashboardTeamMember>();

  for (const member of player.teamMembers) {
    if (
      member.teamSlot !== null &&
      member.teamSlot >= 1 &&
      member.teamSlot <= TEAM_SIZE
    ) {
      membersBySlot.set(member.teamSlot, member);
    }
  }

  const occupied = membersBySlot.size;

  return {
    occupied,
    free: TEAM_SIZE - occupied,
    percentage: Math.round((occupied / TEAM_SIZE) * 100),
    slots: Array.from({ length: TEAM_SIZE }, (_, index) =>
      membersBySlot.get(index + 1) ?? null
    ),
  };
}

export function buildOpenRoutes(
  encounters: AdminDashboardEncounter[],
  playerCount: number,
): AdminDashboardOpenRoute[] {
  const routes = new Map<number, AdminDashboardOpenRoute>();

  for (const encounter of encounters) {
    const route = routes.get(encounter.route.id) ?? {
      routeId: encounter.route.id,
      routeName: encounter.route.name,
      encounters: [],
      isComplete: false,
    };
    route.encounters.push(encounter);
    route.isComplete = playerCount > 0 && route.encounters.length === playerCount;
    routes.set(route.routeId, route);
  }

  return Array.from(routes.values());
}

/** Alle Spieler teilen die Plätze; belegt ist ein Platz, wenn irgendein Spieler ihn nutzt. */
export function getFirstFreeTeamSlot(players: AdminDashboardPlayer[]): number | null {
  const occupied = new Set(players.flatMap((player) => player.teamMembers.map((member) => member.teamSlot)));
  const slots = Array.from({ length: TEAM_SIZE }, (_, index) => index + 1);
  return slots.find((slot) => !occupied.has(slot)) ?? null;
}

export function buildRecentEvents(
  encounters: AdminDashboardEncounter[],
  limit = 8
): AdminDashboardEvent[] {
  const events: AdminDashboardEvent[] = [];

  for (const encounter of encounters) {
    if (encounter.isKnockedOut) {
      events.push({
        id: `knocked-out-${encounter.id}`,
        type: 'knocked_out',
        occurredAt: encounter.koDate,
        player: encounter.player,
        pokemon: encounter.pokemon,
        route: encounter.route,
        nickname: encounter.nickname,
        causedBy: encounter.koCausedBy,
        reason: encounter.koReason,
      });
    }

    if (encounter.isNotCaught) {
      events.push({
        id: `not-caught-${encounter.id}`,
        type: 'not_caught',
        occurredAt: encounter.notCaughtDate,
        player: encounter.player,
        pokemon: encounter.pokemon,
        route: encounter.route,
        nickname: encounter.nickname,
        causedBy: encounter.notCaughtBy,
        reason: encounter.notCaughtReason,
      });
    }

    events.push({
      id: `encounter-created-${encounter.id}`,
      type: 'encounter_created',
      occurredAt: encounter.createdAt,
      player: encounter.player,
      pokemon: encounter.pokemon,
      route: encounter.route,
      nickname: encounter.nickname,
      causedBy: null,
      reason: null,
    });
  }

  return events
    .sort((left, right) => {
      if (left.occurredAt === null && right.occurredAt === null) return 0;
      if (left.occurredAt === null) return 1;
      if (right.occurredAt === null) return -1;
      return right.occurredAt.getTime() - left.occurredAt.getTime();
    })
    .slice(0, Math.max(0, limit));
}
