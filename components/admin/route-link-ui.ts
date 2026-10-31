import type { EncounterAdminTarget } from '@/lib/encounter-admin';

export const TEAM_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export type OccupiedTeamSlots = Record<number, { routeId: number; routeName: string }>;

export interface EncounterRouteLinkTarget {
  route: {
    id: number;
    name: string;
  };
  encounters: EncounterAdminTarget[];
  /** Number of players expected to have one encounter on this route. */
  expectedPlayerCount?: number;
  /** Belegung aller Teamplätze, damit die Auswahl Konflikte vorab zeigt. */
  occupiedTeamSlots?: OccupiedTeamSlots;
}

export interface EncounterRouteLinkState {
  memberCount: number;
  expectedPlayerCount: number;
  missingPlayerCount: number;
  isComplete: boolean;
  isStatusMixed: boolean;
  isTeamSlotMixed: boolean;
  allActive: boolean;
  hasInactiveMembers: boolean;
  teamSlot: number | null | 'mixed';
  canAssignToTeam: boolean;
  blockedReasons: string[];
}

export function getEncounterRouteLinkState(
  link: EncounterRouteLinkTarget,
): EncounterRouteLinkState {
  const uniquePlayerCount = new Set(
    link.encounters.map((encounter) => encounter.player.id),
  ).size;
  const expectedPlayerCount = Math.max(
    uniquePlayerCount,
    link.expectedPlayerCount ?? uniquePlayerCount,
  );
  const missingPlayerCount = Math.max(0, expectedPlayerCount - uniquePlayerCount);
  const isComplete = uniquePlayerCount > 0 && missingPlayerCount === 0;

  const statuses = new Set(
    link.encounters.map((encounter) => {
      if (encounter.isKnockedOut) return 'knocked-out';
      if (encounter.isNotCaught) return 'not-caught';
      return 'active';
    }),
  );
  const teamSlots = new Set(
    link.encounters.map((encounter) => encounter.teamSlot ?? 'none'),
  );
  const isStatusMixed = statuses.size > 1;
  const isTeamSlotMixed = teamSlots.size > 1;
  const allActive = statuses.size === 1 && statuses.has('active');
  const hasInactiveMembers = link.encounters.some(
    (encounter) => encounter.isKnockedOut || encounter.isNotCaught,
  );
  const onlyTeamSlot = teamSlots.values().next().value;
  const teamSlot = isTeamSlotMixed
    ? 'mixed'
    : onlyTeamSlot === 'none' || onlyTeamSlot === undefined
      ? null
      : Number(onlyTeamSlot);

  const blockedReasons: string[] = [];
  if (link.encounters.length === 0) {
    blockedReasons.push('Für diese Route sind noch keine Pokémon erfasst.');
  }
  if (missingPlayerCount > 0) {
    blockedReasons.push(
      `${missingPlayerCount} von ${expectedPlayerCount} erwarteten Spieler-Encounters fehlen.`,
    );
  }
  if (isStatusMixed) {
    blockedReasons.push('Die Pokémon besitzen unterschiedliche Statuswerte.');
  }
  if (isTeamSlotMixed) {
    blockedReasons.push('Die Pokémon besitzen unterschiedliche Teamplätze.');
  }
  if (!allActive && !isStatusMixed && link.encounters.length > 0) {
    blockedReasons.push('K.O. oder nicht gefangene Routen müssen zuerst reaktiviert werden.');
  }

  return {
    memberCount: link.encounters.length,
    expectedPlayerCount,
    missingPlayerCount,
    isComplete,
    isStatusMixed,
    isTeamSlotMixed,
    allActive,
    hasInactiveMembers,
    teamSlot,
    canAssignToTeam:
      link.encounters.length > 0 &&
      isComplete &&
      allActive &&
      !isStatusMixed,
    blockedReasons,
  };
}

export function getOccupiedTeamSlots(
  routes: { id: number; name: string; encounters: { teamSlot: number | null }[] }[],
): OccupiedTeamSlots {
  const occupied: OccupiedTeamSlots = {};
  for (const route of routes) {
    for (const { teamSlot } of route.encounters) {
      if (teamSlot !== null) {
        occupied[teamSlot] = { routeId: route.id, routeName: route.name };
      }
    }
  }
  return occupied;
}

export function getFirstFreeTeamSlot(occupied: OccupiedTeamSlots): number | null {
  return TEAM_SLOTS.find((slot) => !occupied[slot]) ?? null;
}

/** Platz für „Ins Team“; null, wenn die Route nicht aufgenommen werden kann oder das Team voll ist. */
export function getNextTeamSlot(link: EncounterRouteLinkTarget): number | null {
  const state = getEncounterRouteLinkState(link);
  if (!state.canAssignToTeam || state.teamSlot !== null) return null;
  return getFirstFreeTeamSlot(link.occupiedTeamSlots ?? {});
}

export function describeTeamSlot(
  slot: number,
  link: EncounterRouteLinkTarget,
  canAssignToTeam: boolean,
) {
  const occupant = link.occupiedTeamSlots?.[slot];
  const occupiedByOtherRoute = Boolean(occupant) && occupant?.routeId !== link.route.id;
  const suffix = occupant ? ` · ${occupant.routeName}` : link.occupiedTeamSlots ? ' · frei' : '';

  return {
    label: `Platz ${slot}${suffix}`,
    disabled: !canAssignToTeam || occupiedByOtherRoute,
  };
}

export function getTeamSlotRouteOptions(
  links: EncounterRouteLinkTarget[],
  playerId: number,
  playerName: string,
) {
  return links
    .map((link) => {
      const state = getEncounterRouteLinkState(link);
      const playerEncounter = link.encounters.find(
        (encounter) => encounter.player.id === playerId,
      );
      const isAlreadyInTeam = playerEncounter !== undefined && playerEncounter.teamSlot !== null;
      const canAssign = Boolean(playerEncounter) && state.canAssignToTeam;
      const disabledReason = !playerEncounter
        ? `${playerName} fehlt auf dieser Route`
        : !state.isComplete
          ? 'Unvollständig'
          : !state.allActive
            ? 'Route muss zuerst reaktiviert werden'
            : null;

      return { link, state, canAssign, disabledReason, isAlreadyInTeam };
    })
    .filter((option) => !option.isAlreadyInTeam);
}

export function pokemonDisplayName(encounter: EncounterAdminTarget) {
  return encounter.nickname || encounter.pokemon.nameGerman || encounter.pokemon.name;
}
