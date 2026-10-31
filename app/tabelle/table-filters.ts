export type TeamFilter = 'all' | 'in-team' | 'not-in-team';
export type EncounterStatusFilter = 'all' | 'active' | 'knocked-out' | 'not-caught';

export interface FilterableEncounterCell {
  encounter: {
    teamSlot: number | null;
    isKnockedOut: boolean;
    isNotCaught: boolean;
  };
}

const TEAM_FILTERS: readonly string[] = ['all', 'in-team', 'not-in-team'];
const STATUS_FILTERS: readonly string[] = ['all', 'active', 'knocked-out', 'not-caught'];

/** Filter aus der URL; unbekannte Werte zeigen wie bisher alles. */
export function parseTeamFilter(value: unknown): TeamFilter {
  return typeof value === 'string' && TEAM_FILTERS.includes(value) ? (value as TeamFilter) : 'all';
}

export function parseStatusFilter(value: unknown): EncounterStatusFilter {
  return typeof value === 'string' && STATUS_FILTERS.includes(value)
    ? (value as EncounterStatusFilter)
    : 'all';
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
