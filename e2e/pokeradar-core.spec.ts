import { expect, test } from '@playwright/test';
import { installPokeradarMocks } from './fixtures';

function queryValue(url: string, key: string) {
  return new URL(url).searchParams.get(key);
}

test.describe('Pokeradar-Kernabläufe', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('übernimmt ein Team, tauscht Pokémon und lädt ein gespeichertes Set', async ({ page }) => {
    await installPokeradarMocks(page);
    await page.goto('/pokeradar');

    await expect(page.getByRole('heading', { name: 'Vergleich', exact: true })).toBeVisible();
    await page.getByText('Teams & Vergleichssets', { exact: true }).click();
    await page.getByRole('button', { name: 'Team von Testspieler übernehmen' }).click();

    await expect.poll(() => queryValue(page.url(), 'pokemon')).toBe('4,7');
    expect(queryValue(page.url(), 'status')).toBe('team,team');
    expect(queryValue(page.url(), 'source')).toBe('team');
    await expect(page.getByRole('button', { name: 'Glumanda ist die Referenz' })).toBeVisible();

    await page.getByRole('button', { name: 'Schiggy als Referenz festlegen' }).click();
    await expect.poll(() => queryValue(page.url(), 'ref')).toBe('7');

    await page.getByLabel('Name des Vergleichssets').fill('Starterteam');
    await page.getByRole('button', { name: 'Aktuelle Auswahl speichern' }).click();
    await expect(page.getByText('Starterteam', { exact: true })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => {
        const value = localStorage.getItem('pokemon-comparison.saved-sets.v2');
        return value ? JSON.parse(value).sets[0]?.label : null;
      }),
    ).toBe('Starterteam');

    await page.locator('section[aria-labelledby="selected-pokemon-heading"]').getByRole('button', { name: 'Schiggy aus dem Vergleich entfernen' }).click();
    await expect.poll(() => queryValue(page.url(), 'pokemon')).toBe('4');
    await page.getByRole('button', { name: 'Bisasam zur Auswahl hinzufügen' }).click();
    await expect.poll(() => queryValue(page.url(), 'pokemon')).toBe('4,1');

    await page.getByRole('button', { name: 'In Vergleich laden' }).click();
    await expect.poll(() => queryValue(page.url(), 'pokemon')).toBe('4,7');
    expect(queryValue(page.url(), 'ref')).toBe('7');
    await expect(page.getByRole('button', { name: 'Schiggy ist die Referenz' })).toBeVisible();
  });

  test('behält nach Auswahl aus Sidebar und Spielerteam den Desktop-Scroll', async ({ page }) => {
    await installPokeradarMocks(page);
    await page.goto('/pokeradar');

    await page.getByRole('button', { name: 'Pokémon für Platz 1 auswählen' }).click();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

    await page.getByRole('button', { name: 'Bisasam zur Auswahl hinzufügen' }).click();
    await page.getByText('Teams & Vergleichssets', { exact: true }).click();
    await page.getByRole('button', { name: 'Flamme zum Vergleich hinzufügen' }).click();

    await expect.poll(() => queryValue(page.url(), 'pokemon')).toBe('1,4');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
