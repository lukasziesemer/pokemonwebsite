import type { Page, Route } from '@playwright/test';

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

export const POKEMON = [
  {
    id: 1,
    pokedexId: 1,
    name: 'bulbasaur',
    nameGerman: 'Bisasam',
    types: 'grass,poison',
    spriteUrl: null,
    spriteGifUrl: null,
    hp: 45,
    attack: 49,
    defense: 49,
    spAttack: 65,
    spDefense: 65,
    speed: 45,
  },
  {
    id: 2,
    pokedexId: 2,
    name: 'ivysaur',
    nameGerman: 'Bisaknosp',
    types: 'grass,poison',
    spriteUrl: null,
    spriteGifUrl: null,
    hp: 60,
    attack: 62,
    defense: 63,
    spAttack: 80,
    spDefense: 80,
    speed: 60,
  },
  {
    id: 4,
    pokedexId: 4,
    name: 'charmander',
    nameGerman: 'Glumanda',
    types: 'fire',
    spriteUrl: null,
    spriteGifUrl: null,
    hp: 39,
    attack: 52,
    defense: 43,
    spAttack: 60,
    spDefense: 50,
    speed: 65,
  },
  {
    id: 5,
    pokedexId: 5,
    name: 'charmeleon',
    nameGerman: 'Glutexo',
    types: 'fire',
    spriteUrl: null,
    spriteGifUrl: null,
    hp: 58,
    attack: 64,
    defense: 58,
    spAttack: 80,
    spDefense: 65,
    speed: 80,
  },
  {
    id: 7,
    pokedexId: 7,
    name: 'squirtle',
    nameGerman: 'Schiggy',
    types: 'water',
    spriteUrl: null,
    spriteGifUrl: null,
    hp: 44,
    attack: 48,
    defense: 65,
    spAttack: 50,
    spDefense: 64,
    speed: 43,
  },
];

const TEAM_RESPONSE = {
  players: [
    {
      id: 11,
      name: 'Testspieler',
      color: '#2563eb',
      comparisonHref: null,
      teamSlots: [
        {
          encounterId: 401,
          teamSlot: 1,
          pokedexId: 4,
          pokemonName: 'charmander',
          pokemonNameGerman: 'Glumanda',
          spriteUrl: null,
          nickname: 'Flamme',
          routeName: 'Route 1',
          status: 'team',
        },
        {
          encounterId: 402,
          teamSlot: 2,
          pokedexId: 7,
          pokemonName: 'squirtle',
          pokemonNameGerman: 'Schiggy',
          spriteUrl: null,
          nickname: null,
          routeName: 'Route 2',
          status: 'team',
        },
      ],
    },
  ],
};

export async function installPokeradarMocks(page: Page) {
  await page.route('**/api/auth/status', (route) => json(route, { isAdmin: false }));
  await page.route('**/api/pokemon', (route) => json(route, { pokemon: POKEMON }));
  await page.route('**/api/pokeradar/teams', (route) => json(route, TEAM_RESPONSE));
  await page.route('**/api/pokeradar/context', (route) => json(route, {
    gameVersionKey: 'black2', gameVersionName: 'Pokémon Schwarz 2', levelCap: 18, runId: 11,
  }));
}

const BLUE = { key: 'red-blue', name: 'Pokémon Blau', generation: 1 };
const GOLD = { key: 'gold-silver', name: 'Pokémon Gold', generation: 2 };

const RUNS = [
  {
    id: 101,
    runNumber: 1,
    status: 'completed',
    loserPlayerName: null,
    startedAt: '2026-01-01T10:00:00.000Z',
    endedAt: '2026-01-01T12:00:00.000Z',
    pausedAt: null,
    totalPausedMs: 0,
    badgesEarned: 8,
    gameVersion: BLUE,
    counts: { encounters: 10, caught: 8, knockedOut: 1, notCaught: 1 },
  },
  {
    id: 102,
    runNumber: 2,
    status: 'failed',
    loserPlayerName: 'Testspieler',
    startedAt: '2026-02-01T10:00:00.000Z',
    endedAt: '2026-02-01T11:30:00.000Z',
    pausedAt: null,
    totalPausedMs: 0,
    badgesEarned: 4,
    gameVersion: BLUE,
    counts: { encounters: 7, caught: 5, knockedOut: 2, notCaught: 0 },
  },
  {
    id: 103,
    runNumber: 3,
    status: 'completed',
    loserPlayerName: null,
    startedAt: '2026-03-01T10:00:00.000Z',
    endedAt: '2026-03-01T13:00:00.000Z',
    pausedAt: null,
    totalPausedMs: 0,
    badgesEarned: 8,
    gameVersion: BLUE,
    counts: { encounters: 9, caught: 7, knockedOut: 1, notCaught: 1 },
  },
];

const totals = {
  gameCount: 2,
  runCount: 4,
  activeRuns: 0,
  failedRuns: 1,
  completedRuns: 3,
  totalEncounters: 32,
  caughtCount: 25,
  knockedOutCount: 4,
  notCaughtCount: 3,
  totalDurationMs: 28_800_000,
  maxBadges: 8,
};

const blueOverview = {
  ...totals,
  runCount: 3,
  failedRuns: 1,
  completedRuns: 2,
  totalEncounters: 26,
  caughtCount: 20,
  knockedOutCount: 4,
  notCaughtCount: 2,
  totalDurationMs: 23_400_000,
  gameVersion: BLUE,
  firstStartedAt: RUNS[0].startedAt,
  lastStartedAt: RUNS[2].startedAt,
};

const goldOverview = {
  ...totals,
  runCount: 1,
  failedRuns: 0,
  completedRuns: 1,
  totalEncounters: 6,
  caughtCount: 5,
  knockedOutCount: 0,
  notCaughtCount: 1,
  totalDurationMs: 5_400_000,
  gameVersion: GOLD,
  firstStartedAt: '2026-04-01T10:00:00.000Z',
  lastStartedAt: '2026-04-01T10:00:00.000Z',
};

function overviewFor(gameKey: string) {
  const filtered = gameKey === BLUE.key;
  return {
    scope: {
      gameKey: filtered ? BLUE.key : null,
      label: filtered ? BLUE.name : 'Alle Spiele',
    },
    totals: filtered
      ? { ...blueOverview, gameCount: 1, gameVersion: undefined, firstStartedAt: undefined, lastStartedAt: undefined }
      : totals,
    games: filtered ? [blueOverview] : [blueOverview, goldOverview],
  };
}

function historyFor(url: URL) {
  const gameKey = url.searchParams.get('game') || 'all';
  const cursor = url.searchParams.get('cursor');

  if (cursor) {
    return {
      groups: [{ gameVersion: BLUE, totalRuns: 3, runs: [RUNS[2]], nextCursor: null }],
      totalRuns: 3,
    };
  }

  const blueGroup = {
    gameVersion: BLUE,
    totalRuns: 3,
    runs: RUNS.slice(0, 2),
    nextCursor: 102,
  };
  if (gameKey === BLUE.key) return { groups: [blueGroup], totalRuns: 3 };

  return {
    groups: [
      blueGroup,
      {
        gameVersion: GOLD,
        totalRuns: 1,
        runs: [{ ...RUNS[0], id: 201, runNumber: 1, gameVersion: GOLD }],
        nextCursor: null,
      },
    ],
    totalRuns: 4,
  };
}

export async function installStatisticsMocks(page: Page) {
  const historyRequests: string[] = [];

  await page.route('**/api/auth/status', (route) => json(route, { isAdmin: false }));
  await page.route('**/api/runs/overview?*', (route) => {
    const url = new URL(route.request().url());
    return json(route, overviewFor(url.searchParams.get('game') || 'all'));
  });
  await page.route('**/api/runs/history?*', (route) => {
    const url = new URL(route.request().url());
    historyRequests.push(url.search);
    return json(route, historyFor(url));
  });
  await page.route('**/api/runs/analytics?*', (route) => {
    const url = new URL(route.request().url());
    const gameKey = url.searchParams.get('game') || 'all';
    return json(route, {
      scope: { gameKey: gameKey === BLUE.key ? BLUE.key : null, label: gameKey === BLUE.key ? BLUE.name : 'Alle Spiele' },
      playerStats: [],
      mostCaught: [],
      longestTeamMembers: [],
      runTrends: [],
    });
  });

  return { historyRequests };
}
