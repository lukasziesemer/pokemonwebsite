export type TeamFilter = 'all' | 'in-team' | 'not-in-team';
export type EncounterStatusFilter = 'all' | 'active' | 'knocked-out' | 'not-caught';

export interface FilterableEncounterCell {
  encounter: {
    teamSlot: number | null;
    isKnockedOut: boolean;
    isNotCaught: boolean;
  };
}

export function compareRoutesByOrder(
  left: { name: string; order: number },
  right: { name: string; order: number },
): number {
  return left.order - right.order || left.name.localeCompare(right.name, 'de-DE');
}

export function encounterMatchesTableFilters(
  cell: FilterableEncounterCell,
  teamFilter: TeamFilter,
  statusFilter: EncounterStatusFilter,
): boolean {
  const { encounter } = cell;
  const matchesTeam =
    teamFilter === 'all' ||
    (teamFilter === 'in-team' && encounter.teamSlot !== null) ||
    (teamFilter === 'not-in-team' && encounter.teamSlot === null);

  const matchesStatus =
    statusFilter === 'all' ||
    (statusFilter === 'active' && !encounter.isKnockedOut && !encounter.isNotCaught) ||
    (statusFilter === 'knocked-out' && encounter.isKnockedOut) ||
    (statusFilter === 'not-caught' && encounter.isNotCaught);

  return matchesTeam && matchesStatus;
}

export function rowMatchesTableFilters(
  cells: Array<FilterableEncounterCell | null>,
  teamFilter: TeamFilter,
  statusFilter: EncounterStatusFilter,
): boolean {
  if (teamFilter === 'all' && statusFilter === 'all') return true;

  return cells.some(
    (cell) => cell !== null && encounterMatchesTableFilters(cell, teamFilter, statusFilter),
  );
}
