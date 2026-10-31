export type RouteListView = 'all' | 'open' | 'team' | 'inactive';

interface FilterableRoute {
  name: string;
  encounters: {
    nickname: string | null;
    teamSlot: number | null;
    isKnockedOut: boolean;
    isNotCaught: boolean;
    pokemon: { name: string; nameGerman: string | null };
  }[];
}

function matchesView(route: FilterableRoute, view: RouteListView) {
  const isInactive = route.encounters.some(({ isKnockedOut, isNotCaught }) => isKnockedOut || isNotCaught);
  const isInTeam = route.encounters.some(({ teamSlot }) => teamSlot !== null);

  switch (view) {
    case 'open':
      return !isInactive && !isInTeam;
    case 'team':
      return isInTeam;
    case 'inactive':
      return isInactive;
    default:
      return true;
  }
}

function matchesQuery(route: FilterableRoute, query: string) {
  const texts = [
    route.name,
    ...route.encounters.flatMap(({ nickname, pokemon }) => [nickname, pokemon.name, pokemon.nameGerman]),
  ];
  return texts.some((text) => text?.toLocaleLowerCase('de-DE').includes(query));
}

export function filterRouteList<T extends FilterableRoute>(
  routes: T[],
  view: RouteListView,
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase('de-DE');
  return routes.filter((route) => matchesView(route, view) && (!query || matchesQuery(route, query)));
}
