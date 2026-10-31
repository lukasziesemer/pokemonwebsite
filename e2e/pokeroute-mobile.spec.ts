import { expect, test, type Page } from '@playwright/test';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

async function openRoutes(page: Page) {
  await page.goto('/pokeroute');
  await expect(page.getByRole('heading', { name: 'Routen & Encounters' })).toBeVisible();
  // /pokeroute rendert serverseitig aus der Datenbank; ohne Routen gibt es kein Raster zu messen.
  test.skip(
    (await page.locator('.route-list-row').count()) === 0,
    'Der aktuelle Spielstand enthält keine Routen; Testdaten kommen aus e2e/seed-test-db.mjs.',
  );
}

async function openAdminRoutes(page: Page) {
  await openRoutes(page);
  // Eine ungültige Admin-Session darf nicht als fehlende Testdaten durchgehen.
  await expect(page.getByRole('button', { name: 'Route erstellen' })).toBeVisible();
}

async function expectNoPageOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

for (const width of [390, 360]) {
  test.describe(`Routen bei ${width} px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test.describe('öffentlich', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test('scrollt nicht horizontal und zeigt alle Spieler ohne Seitwärtswischen', async ({ page }) => {
        await openRoutes(page);
        await expectNoPageOverflow(page);

        // Ein eigener Scroll-Container würde den Seitenüberlauf nur verstecken.
        const playerHeadings = page.locator('.route-list-row h4');
        test.skip((await playerHeadings.count()) === 0, 'Der aktuelle Spielstand enthält keine Spieler.');
        for (const heading of await playerHeadings.all()) {
          const box = await heading.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        }
      });

      test('öffnet Encounter-Karten per Tippen', async ({ page }) => {
        await openRoutes(page);

        const card = page.locator('.route-list-row').getByRole('button', { name: /: Details öffnen$/ }).first();
        test.skip((await card.count()) === 0, 'Der aktuelle Spielstand enthält keine Encounter.');

        await card.click();
        await expect(page.getByRole('dialog')).toBeVisible();
      });
    });

    test.describe('als Admin', () => {
      test.skip(
        !adminUsername || !adminPassword,
        'ADMIN_USERNAME und ADMIN_PASSWORD fehlen; ein echter Admin-Login kann nicht sicher geprüft werden.',
      );

      test('hält Encounter-Menüs im Viewport', async ({ page }) => {
        await openAdminRoutes(page);
        await expectNoPageOverflow(page);

        const trigger = page
          .locator('.route-list-row')
          .getByRole('button', { name: /^(?!Route ).+ verwalten$/ })
          .first();
        test.skip((await trigger.count()) === 0, 'Der aktuelle Spielstand enthält keine Encounter.');

        await trigger.click();

        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await expectNoPageOverflow(page);
      });

      test('schneidet die Pokémon-Suche freier Slots nicht ab', async ({ page }) => {
        await openAdminRoutes(page);

        const search = page.locator('.route-list-row').getByPlaceholder('Pokemon suchen...').first();
        test.skip((await search.count()) === 0, 'Der aktuelle Spielstand enthält keinen freien Slot.');

        await search.fill('a');
        const popup = page
          .locator('.route-list-row button', { hasText: '#' })
          .or(page.getByText('Kein Pokemon gefunden'))
          .first();
        await expect(popup).toBeVisible();
        // Liegt das Dropdown in einem Clip-Container, trifft der Klickpunkt nicht mehr sein Element.
        await popup.click({ trial: true });
        await expectNoPageOverflow(page);
      });
    });
  });
}
