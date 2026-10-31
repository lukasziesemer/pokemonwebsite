import { expect, test, type Page } from '@playwright/test';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

test.skip(
  !adminUsername || !adminPassword,
  'ADMIN_USERNAME und ADMIN_PASSWORD fehlen; ein echter Admin-Login kann nicht sicher geprüft werden.',
);

async function openRoutes(page: Page) {
  await page.goto('/pokeroute');
  await expect(page.getByRole('button', { name: 'Route erstellen' })).toBeVisible();
  const rows = page.locator('.route-list-row');
  test.skip((await rows.count()) === 0, 'Der aktuelle Spielstand enthält keine Routen.');
  return rows;
}

test.describe('Routenmenü', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('zeigt die Routenpflege sichtbar statt nur beim Überfahren', async ({ page }) => {
    const rows = await openRoutes(page);
    await expect(page.locator('.route-list-row .opacity-0')).toHaveCount(0);

    const trigger = rows.first().getByRole('button', { name: 'Route verwalten', exact: true });
    await trigger.tap();

    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Route umbenennen' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Nach oben verschieben' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'Nach unten verschieben' })).toBeEnabled();
    await expect(menu.getByRole('menuitem', { name: 'Route löschen', exact: true })).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });
});

test.describe('Teamplatz-Auswahl', () => {
  test('zeigt die Belegung und schlägt den ersten freien Platz vor', async ({ page }) => {
    const rows = await openRoutes(page);
    const freeRoute = rows.filter({ hasNot: page.getByText(/^Im Team/) }).last();
    await freeRoute.getByRole('button', { name: 'Route verwalten', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Teamplatz verwalten' }).click();

    const select = page.getByRole('dialog').getByRole('combobox');
    const occupied = select.locator('option[disabled]');
    test.skip((await occupied.count()) === 0, 'Der aktuelle Spielstand belegt keinen Teamplatz.');
    await expect(occupied.first()).toHaveText(/^Platz \d · .+/);
    await expect(select).not.toHaveValue('none');
    await expect(select.locator('option:checked')).toHaveText(/· frei$/);
  });
});

test.describe('Ins Team', () => {
  test('setzt eine vollständige Route ohne Umweg auf den ersten freien Platz', async ({ page }) => {
    const requests: unknown[] = [];
    await page.route(/\/api\/admin\/encounter-links\/\d+$/, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'E2E: Änderung sicher abgefangen' }),
      });
    });
    page.on('dialog', (dialog) => void dialog.accept());

    await openRoutes(page);
    const button = page.getByRole('button', { name: /auf Platz \d ins Team$/ }).first();
    test.skip((await button.count()) === 0, 'Der aktuelle Spielstand enthält keine freie vollständige Route.');
    const label = await button.getAttribute('aria-label');
    await button.click();

    await expect.poll(() => requests).toEqual([
      { action: 'set-team-slot', teamSlot: Number(label!.match(/Platz (\d)/)![1]) },
    ]);
  });
});

test.describe('Encounter-Dialoge', () => {
  test('speichern den Spitznamen mit Enter und fokussieren das Eingabefeld', async ({ page }) => {
    const requests: unknown[] = [];
    await page.route(/\/api\/admin\/encounters\/\d+$/, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'E2E: Änderung sicher abgefangen' }),
      });
    });

    const rows = await openRoutes(page);
    const trigger = rows.getByRole('button', { name: /^(?!Route ).+ verwalten$/ }).first();
    test.skip((await trigger.count()) === 0, 'Der aktuelle Spielstand enthält keine Encounter.');
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Spitzname bearbeiten' }).click();

    const dialog = page.getByRole('dialog', { name: 'Spitzname bearbeiten' });
    const input = dialog.getByLabel('Spitzname');
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Spitzname speichern' })).toBeDisabled();
    await input.fill('Testname');
    await input.press('Enter');

    await expect.poll(() => requests).toEqual([
      { action: 'update-nickname', nickname: 'Testname' },
    ]);
  });

  test('wählen beim Tausch mit Enter den ersten Treffer und bestätigen mit dem nächsten Enter', async ({ page }) => {
    const requests: unknown[] = [];
    await page.route(/\/api\/admin\/encounters\/\d+$/, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'E2E: Änderung sicher abgefangen' }),
      });
    });

    const rows = await openRoutes(page);
    const trigger = rows.getByRole('button', { name: /^(?!Route ).+ verwalten$/ }).first();
    test.skip((await trigger.count()) === 0, 'Der aktuelle Spielstand enthält keine Encounter.');
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Pokémon tauschen' }).click();

    const dialog = page.getByRole('dialog', { name: 'Pokémon tauschen' });
    const search = dialog.getByRole('searchbox');
    await expect(search).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Pokémon tauschen' })).toBeDisabled();
    await search.fill('bisaknosp');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await search.press('Enter');
    await expect(dialog.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    expect(requests).toEqual([]);
    await search.press('Enter');

    await expect.poll(() => requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ action: 'swap-pokemon' });
  });
});
