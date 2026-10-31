import { expect, test } from '@playwright/test';
import { expandAllRoutes } from './fixtures';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

test.describe('Routenliste', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('zeigt Routen kompakt und klappt sie einzeln auf', async ({ page }) => {
    await page.goto('/pokeroute');
    const row = page.locator('.route-list-row').first();
    test.skip((await row.count()) === 0, 'Der aktuelle Spielstand enthält keine Routen.');
    await expect(row.locator('h4')).toHaveCount(0);

    const toggle = row.getByRole('button', { name: / aufklappen$/ });
    await expect(async () => {
      await toggle.click({ timeout: 500 });
      await expect(row.locator('h4').first()).toBeVisible({ timeout: 500 });
    }).toPass();
    await row.getByRole('button', { name: / einklappen$/ }).click();
    await expect(row.locator('h4')).toHaveCount(0);
  });

  test('filtert nach Status und sucht Routen und Pokémon', async ({ page }) => {
    await page.goto('/pokeroute');
    const rows = page.locator('.route-list-row');
    const total = await rows.count();
    test.skip(total === 0, 'Der aktuelle Spielstand enthält keine Routen.');

    const search = page.getByRole('searchbox', { name: 'Route oder Pokémon suchen' });
    await expect(async () => {
      await search.fill('gibtsnicht');
      await expect(page.getByText('Keine Route passt zu dieser Auswahl.')).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(rows).toHaveCount(0);

    await search.fill('');
    await expect(rows).toHaveCount(total);
    await page.getByRole('combobox', { name: 'Routen filtern' }).selectOption('team');
    await expect(rows.first().getByText(/^Im Team/)).toBeVisible();
    await expect(rows.filter({ hasNotText: 'Im Team' })).toHaveCount(0);
  });
});

test.describe('Admin-Zentrale', () => {
  test.skip(
    !adminUsername || !adminPassword,
    'ADMIN_USERNAME und ADMIN_PASSWORD fehlen; ein echter Admin-Login kann nicht sicher geprüft werden.',
  );

  test('zählt Routen und führt mit Aufgabenbezug weiter', async ({ page }) => {
    await page.goto('/admin');
    const section = page.getByRole('region', { name: 'Offene Routen' }).or(page.locator('section', { hasText: 'Offene Routen' })).first();
    const link = section.getByRole('link', { name: 'Fang fehlt noch' }).first();
    test.skip((await link.count()) === 0, 'Der aktuelle Spielstand enthält keine unvollständige Route.');

    await link.click();
    await expect(page).toHaveURL(/\/pokeroute\?route=\d+$/);
    const routeId = new URL(page.url()).searchParams.get('route');
    await expect(page.locator(`#route-${routeId}-details`)).toBeVisible();
  });

  test('setzt eine vollständige Route direkt ins Team', async ({ page }) => {
    const requests: unknown[] = [];
    await page.route(/\/api\/admin\/encounter-links\/\d+$/, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'E2E: Änderung sicher abgefangen' }),
      });
    });
    await page.goto('/admin');
    const button = page.getByRole('button', { name: /auf Platz \d ins Team$/ }).first();
    test.skip((await button.count()) === 0, 'Der aktuelle Spielstand enthält keine freie vollständige Route.');
    const label = await button.getAttribute('aria-label');

    await expect(async () => {
      await button.click({ timeout: 500 });
      expect(requests.length).toBeGreaterThan(0);
    }).toPass();
    expect(requests[0]).toEqual({
      action: 'set-team-slot',
      teamSlot: Number(label!.match(/Platz (\d)/)![1]),
    });
    await expect(page.getByRole('alert').filter({ hasText: 'E2E' })).toBeVisible();
  });

  test('übernimmt die Filter aus dem Link in die Tabelle', async ({ page }) => {
    await page.goto('/tabelle?team=not-in-team&status=active');
    await expect(page.locator('select').filter({ has: page.locator('option[value="not-in-team"]') })).toHaveValue('not-in-team');
    await expect(page.locator('select').filter({ has: page.locator('option[value="knocked-out"]') })).toHaveValue('active');
  });
});

test.describe('bei 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('bleibt beim Aufklappen ohne Seitenüberlauf', async ({ page }) => {
    await page.goto('/pokeroute');
    test.skip((await page.locator('.route-list-row').count()) === 0, 'Der aktuelle Spielstand enthält keine Routen.');
    await expandAllRoutes(page);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
});
