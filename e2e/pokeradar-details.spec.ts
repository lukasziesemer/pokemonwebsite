import { expect, test, type Page } from '@playwright/test';
import type { LevelUpMove, PokemonDetailsResponse } from '../lib/pokemon-details';
import { installPokeradarMocks, POKEMON } from './fixtures';

const move = (name: string, displayName: string, level: number, type = 'normal'): LevelUpMove => ({
  name, nameGerman: displayName, displayName, level, order: level, type,
  damageClass: 'physical', power: 40, accuracy: 100, pp: 35,
});

function details(id: number, editionKey: string | null = 'black2'): PokemonDetailsResponse {
  const pokemon = POKEMON.find(entry => entry.pokedexId === id) ?? { ...POKEMON[0], pokedexId: id, name: `pokemon-${id}`, nameGerman: `Pokémon ${id}` };
  const chain = id === 1 || id === 2 ? [POKEMON[0], POKEMON[1]] : id === 4 || id === 5 ? [POKEMON[2], POKEMON[3]] : [pokemon];
  const { hp, attack, defense, spAttack, spDefense, speed } = pokemon;
  return {
    pokemon: { ...pokemon, displayName: pokemon.nameGerman, types: pokemon.types.split(','), stats: { hp, attack, defense, spAttack, spDefense, speed, total: hp + attack + defense + spAttack + spDefense + speed } },
    edition: editionKey ? { key: editionKey, name: editionKey === 'blue' ? 'Pokémon Blau' : 'Pokémon Schwarz 2', versionSlug: editionKey === 'blue' ? 'blue' : 'black-2', versionGroupSlug: editionKey === 'blue' ? 'red-blue' : 'black-2-white-2' } : null,
    levelUpMoves: editionKey ? [
      move('tackle', 'Tackle', 1), move('tackle', 'Tackle', 7),
      move('growl', 'Heuler', id === 1 ? 3 : 5),
      ...(id === 1 ? [move('razor-leaf', 'Rasierblatt', 20, 'grass')] : [move('ember', 'Glut', 9, 'fire'), move('flamethrower', 'Flammenwurf', 34, 'fire')]),
    ] : null,
    evolution: {
      nodes: chain.map(entry => ({ ...entry, displayName: entry.nameGerman, generation: 1 })),
      edges: chain.length > 1 ? [{ fromPokedexId: chain[0].pokedexId, toPokedexId: chain[1].pokedexId, conditions: [{ trigger: 'level-up', label: 'Ab Level 16', minLevel: 16 }] }] : [],
      editionScope: { generation: 5, excludedPokemonCount: 0, conditionsVerified: true, note: 'Entwicklungsbedingungen für diese Edition.' },
    },
    cache: { status: 'hit', fetchedAt: '2026-09-05T00:00:00Z', expiresAt: '2026-09-06T00:00:00Z', stale: false },
  };
}

async function mockDetails(page: Page, fail = () => false) {
  const requests: string[] = [];
  await page.route('**/api/pokemon/*/details*', route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const id = Number(url.pathname.split('/')[3]);
    return route.fulfill({
      status: fail() && id === 4 ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(fail() && id === 4 ? { error: 'Testweise nicht erreichbar' } : details(id, url.searchParams.get('gameVersion') === 'none' ? null : url.searchParams.get('gameVersion') || 'black2')),
    });
  });
  return requests;
}

test.describe('Editionsbezogene Vergleichsdetails', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('lädt nur beim Öffnen, teilt Cache mit Pop-out und trennt die Referenzaktion', async ({ page }) => {
    await installPokeradarMocks(page);
    const requests = await mockDetails(page);
    await page.goto('/pokeradar?pokemon=1,4&ref=1');
    const moves = page.getByRole('button', { name: 'Level-up-Attacken', exact: true });
    await expect(moves).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Entwicklungen im Vergleich', exact: true })).toHaveAttribute('aria-expanded', 'false');
    expect(requests).toHaveLength(0);

    const trigger = page.getByRole('button', { name: 'Glumanda: Details öffnen', exact: true });
    await trigger.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Attacken nach Level' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('ref')).toBe('1');
    expect(requests).toEqual(['/api/pokemon/4/details?gameVersion=black2']);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

    await page.getByRole('button', { name: 'Glumanda als Referenz festlegen', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('ref')).toBe('4');
    await moves.click();
    const table = page.getByRole('table', { name: /Lernlevel der ausgewählten/ });
    await expect(table.getByRole('row', { name: /Tackle/ })).toContainText('Lv. 7');
    await expect(table.getByRole('row', { name: /Rasierblatt/ })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests.every(url => url.endsWith('gameVersion=black2'))).toBe(true);
    await page.getByRole('checkbox', { name: 'Nur Unterschiede' }).check();
    await expect(table.getByRole('row', { name: /Tackle/ })).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Bis Level-Cap/ }).check();
    await expect(table.getByRole('row', { name: /Rasierblatt|Flammenwurf/ })).toHaveCount(0);
    await page.getByLabel('Attackentyp', { exact: true }).selectOption('fire');
    await expect(table.getByRole('row', { name: /Glut/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Heuler/ })).toHaveCount(0);
    await moves.click();
    await moves.click();
    expect(requests).toHaveLength(2);

    await page.getByRole('button', { name: 'Entwicklungen im Vergleich', exact: true }).click();
    await page.getByRole('button', { name: /Bisaknosp zum Vergleich hinzufügen/ }).first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get('pokemon')).toBe('1,4,2');
    expect(new URL(page.url()).searchParams.get('ref')).toBe('4');
    await expect(page.getByRole('button', { name: 'Bisaknosp: Details öffnen', exact: true })).toBeVisible();
  });

  test('kennzeichnet Teilausfälle als unbekannt und lädt beim Retry nur die fehlende Spalte', async ({ page }) => {
    await installPokeradarMocks(page);
    let failing = true;
    const requests = await mockDetails(page, () => failing);
    await page.goto('/pokeradar?pokemon=1,4&ref=1');
    await page.getByRole('button', { name: 'Level-up-Attacken', exact: true }).click();
    const table = page.getByRole('table', { name: /Lernlevel der ausgewählten/ });
    await expect(table.getByRole('row', { name: /Tackle/ })).toContainText('Ladefehler');
    await expect(page.getByRole('checkbox', { name: 'Nur Unterschiede' })).toBeDisabled();
    failing = false;
    await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Nur Unterschiede' })).toBeEnabled();
    expect(requests.filter(url => url.includes('/1/'))).toHaveLength(1);
    expect(requests.filter(url => url.includes('/4/'))).toHaveLength(2);
  });

  test('zeigt ohne Run-Edition keine geratene Attackenliste', async ({ page }) => {
    await installPokeradarMocks(page);
    await page.route('**/api/pokeradar/context', route => route.fulfill({ json: { gameVersionKey: null, gameVersionName: null, levelCap: null, runId: null } }));
    const requests = await mockDetails(page);
    await page.goto('/pokeradar?pokemon=1,4');
    await page.getByRole('button', { name: 'Level-up-Attacken', exact: true }).click();
    await expect(page.getByText('Dem aktuellen Run ist keine Edition zugeordnet.', { exact: false })).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Glumanda: Details öffnen', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Keine Edition festgelegt')).toBeVisible();
    expect(requests).toEqual(['/api/pokemon/4/details?gameVersion=none']);
  });

  test('heilt einen gemeinsamen Ladefehler nach Retry in beiden offenen Abschnitten', async ({ page }) => {
    await installPokeradarMocks(page);
    let failing = true;
    await mockDetails(page, () => failing);
    await page.goto('/pokeradar?pokemon=1,4');
    const movesButton = page.getByRole('button', { name: 'Level-up-Attacken', exact: true });
    await movesButton.click();
    await expect(page.getByRole('table', { name: /Lernlevel der ausgewählten/ })).toContainText('Ladefehler');
    await page.getByRole('button', { name: 'Entwicklungen im Vergleich', exact: true }).click();
    await expect(page.getByText('Testweise nicht erreichbar', { exact: true })).toBeVisible();
    failing = false;
    await movesButton.locator('..').locator('..').getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
    await expect(page.getByRole('button', { name: /Glutexo zum Vergleich hinzufügen/ }).first()).toBeEnabled();
    await expect(page.getByText('Testweise nicht erreichbar', { exact: true })).toHaveCount(0);
  });

  test('schließt veraltete Details, wenn der Run-Kontext nach einem Live-Update ausfällt', async ({ page }) => {
    await installPokeradarMocks(page);
    await mockDetails(page);
    let failedContext = false;
    let runsRevision = '0';
    await page.route('**/api/events/latest?*', route => route.fulfill({ json: {
      events: [], serverTime: Date.now(), revisions: { encounters: '0', routes: '0', runs: runsRevision, players: '0', streams: '0', pokemon: '0' },
    } }));
    await page.route('**/api/pokeradar/context', route => route.fulfill({
      status: failedContext ? 500 : 200,
      json: failedContext ? { error: 'Testfehler' } : { gameVersionKey: 'black2', gameVersionName: 'Pokémon Schwarz 2', levelCap: 18, runId: 11 },
    }));
    await page.goto('/pokeradar?pokemon=1,4');
    await page.getByRole('button', { name: 'Glumanda: Details öffnen', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Attacken nach Level' })).toBeVisible();
    failedContext = true;
    runsRevision = '1';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Edition erneut laden' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Glumanda: Details öffnen', exact: true })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('hält sechs Spalten mobil scrollbar und verhindert zusätzliche Evolutionsauswahl', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installPokeradarMocks(page);
    const extras = [3, 6, 8].map(id => ({ ...POKEMON[0], id, pokedexId: id, name: `pokemon-${id}`, nameGerman: `Pokémon ${id}` }));
    await page.route('**/api/pokemon', route => route.fulfill({ json: { pokemon: [...POKEMON, ...extras] } }));
    await mockDetails(page);
    await page.goto('/pokeradar?pokemon=1,4,7,3,6,8&ref=1');
    await page.getByRole('button', { name: 'Level-up-Attacken', exact: true }).click();
    const scrollRegion = page.getByRole('region', { name: 'Level-up-Attacken, horizontal scrollbar' });
    await expect(scrollRegion.getByText('Lv. 7').first()).toBeVisible();
    expect(await scrollRegion.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await scrollRegion.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect.poll(() => scrollRegion.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Entwicklungen im Vergleich', exact: true }).click();
    await expect(page.getByRole('button', { name: /Bisaknosp zum Vergleich hinzufügen/ }).first()).toBeDisabled();
    expect(new URL(page.url()).searchParams.get('pokemon')).toBe('1,4,7,3,6,8');
  });

  test('verwirft beim Live-Runwechsel das alte Pop-out und lädt die neue Edition separat', async ({ page }) => {
    await installPokeradarMocks(page);
    const requests = await mockDetails(page);
    let nextRun = false;
    await page.route('**/api/events/latest?*', route => route.fulfill({ json: {
      events: [], serverTime: Date.now(), revisions: { encounters: '0', routes: '0', runs: nextRun ? '1' : '0', players: '0', streams: '0', pokemon: '0' },
    } }));
    await page.route('**/api/pokeradar/context', route => route.fulfill({ json: nextRun
      ? { gameVersionKey: 'blue', gameVersionName: 'Pokémon Blau', levelCap: 14, runId: 12 }
      : { gameVersionKey: 'black2', gameVersionName: 'Pokémon Schwarz 2', levelCap: 18, runId: 11 },
    }));
    await page.goto('/pokeradar?pokemon=1,4&ref=4');
    const trigger = page.getByRole('button', { name: 'Glumanda: Details öffnen', exact: true });
    await trigger.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Attacken nach Level' })).toBeVisible();
    nextRun = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Edition des aktuellen Runs:', { exact: false })).toContainText('Pokémon Blau', { timeout: 10000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await trigger.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Attacken nach Level' })).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Pokémon Blau');
    expect(requests).toEqual(['/api/pokemon/4/details?gameVersion=black2', '/api/pokemon/4/details?gameVersion=blue']);
    expect(new URL(page.url()).searchParams.get('ref')).toBe('4');
  });
});
