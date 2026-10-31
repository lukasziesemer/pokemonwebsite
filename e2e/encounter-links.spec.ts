import { expect, test, type Locator, type Page } from '@playwright/test';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

type CapturedLinkMutation = {
  method: 'PATCH' | 'DELETE';
  routeId: number;
  body: unknown;
};

function requireAdminCredentials() {
  test.skip(
    !adminUsername || !adminPassword,
    'ADMIN_USERNAME und ADMIN_PASSWORD fehlen; ein echter Admin-Login kann nicht sicher geprüft werden.',
  );
}

async function openAdminSurface(page: Page, path: '/pokeroute' | '/tabelle') {
  requireAdminCredentials();
  await page.goto(path);
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
}

async function interceptEncounterLinkMutations(page: Page) {
  const captured: CapturedLinkMutation[] = [];

  await page.route(/\/api\/admin\/encounter-links\/\d+\/?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const match = pathname.match(/^\/api\/admin\/encounter-links\/(\d+)\/?$/);
    const method = request.method();

    if (!match || (method !== 'PATCH' && method !== 'DELETE')) {
      await route.continue();
      return;
    }

    let body: unknown = null;
    if (method === 'PATCH') {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }
    captured.push({ method, routeId: Number(match[1]), body });

    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      headers: { 'x-e2e-intercepted': 'true' },
      body: JSON.stringify({ error: 'E2E: Link-Änderung sicher abgefangen' }),
    });
  });

  return captured;
}

function tableRows(page: Page) {
  return page.locator('tbody tr');
}

function routeLinkTrigger(row: Locator) {
  return row.getByRole('button', { name: 'Route', exact: true });
}

async function skipWithoutRouteLink(trigger: Locator, surface: string) {
  let isVisible = false;
  try {
    await trigger.first().waitFor({ state: 'visible', timeout: 10_000 });
    isVisible = true;
  } catch {
    // Der semantische Skip erfolgt erst nach der Hydration-Wartezeit.
  }
  test.skip(!isVisible, `${surface} enthält keinen verwaltbaren Route-Link.`);
}

async function firstTableRouteLink(page: Page) {
  const trigger = page
    .locator('tbody th[scope="row"]')
    .getByRole('button', { name: 'Route', exact: true })
    .first();
  await skipWithoutRouteLink(trigger, 'Die Tabelle');
  const row = trigger.locator('xpath=ancestor::tr').first();
  await expect(row).toBeVisible();
  return { row, trigger };
}

async function openFirstCompleteRouteLink(page: Page) {
  await firstTableRouteLink(page);
  const rows = tableRows(page);
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const trigger = routeLinkTrigger(row);
    if ((await trigger.count()) === 0 || !(await trigger.isEnabled())) continue;

    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole('menu', { name: /Route verwalten/i });
    await expect(menu).toBeVisible();
    const knockout = menu.getByRole('menuitem', { name: 'K.O. setzen' });
    if (await knockout.isEnabled()) return { row, trigger, menu };

    await page.keyboard.press('Escape');
  }

  test.skip(true, 'Die Tabelle enthält keinen vollständigen Route-Link.');
  throw new Error('unreachable');
}

test.describe('Encounter-Link-Verwaltung', () => {
  test('zeigt die Gruppenaktion in der Routenspalte und listet alle betroffenen Pokémon', async ({
    page,
  }) => {
    await openAdminSurface(page, '/tabelle');

    const { row, trigger } = await firstTableRouteLink(page);
    await expect(trigger).toBeVisible();
    await expect(trigger.locator('xpath=ancestor::th[@scope="row"]')).toHaveCount(1);

    const encounterCount = await row
      .locator('td')
      .getByRole('button', { name: /\S+ verwalten$/i })
      .count();
    await trigger.click();
    const menu = page.getByRole('menu', { name: /Route verwalten/i });
    await menu.getByRole('menuitem', { name: 'Teamplatz verwalten' }).click();

    const dialog = page.getByRole('dialog', { name: 'Teamplatz verwalten' });
    await expect(dialog).toBeVisible();
    const affectedHeading = dialog.getByRole('heading', { name: 'Betroffene Pokémon' });
    const affectedPokemon = dialog.locator('section').filter({
      hasText: 'Betroffene Pokémon',
    });
    await expect(affectedHeading).toBeVisible();
    await expect(affectedPokemon.getByRole('listitem')).toHaveCount(encounterCount);
    await expect(affectedPokemon.getByText(`${encounterCount}`, { exact: true })).toBeVisible();
  });

  test('verwendet das Link-Menü ebenfalls auf der Routenseite', async ({ page }) => {
    await openAdminSurface(page, '/pokeroute');

    const trigger = page.locator('.route-list-row').getByRole('button', { name: 'Route verwalten', exact: true }).first();
    await skipWithoutRouteLink(trigger, 'Die Routenseite');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const menu = page.getByRole('menu', { name: /Route verwalten/i });
    await expect(menu.getByRole('menuitem', { name: 'Teamplatz verwalten' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'K.O. setzen' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Nicht gefangen' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Alle Pokémon der Route löschen' })).toBeVisible();
  });

  test('sendet K.O. für den kompletten Link mit optionalem Grund', async ({ page }) => {
    const captured = await interceptEncounterLinkMutations(page);
    await openAdminSurface(page, '/tabelle');
    const { menu } = await openFirstCompleteRouteLink(page);

    await menu.getByRole('menuitem', { name: 'K.O. setzen' }).click();
    const dialog = page.getByRole('dialog', { name: 'K.O. setzen' });
    await expect(dialog.getByRole('heading', { name: 'Betroffene Pokémon' })).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'K.O. setzen' });
    await expect(confirm).toBeDisabled();
    const playerButton = dialog.getByRole('group', { name: 'Verursacher' }).getByRole('button').first();
    const selectedPlayer = await playerButton.innerText();
    await playerButton.click();
    await expect(playerButton).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByText('Grund hinzufügen (optional)').click();
    await expect(dialog.getByLabel('Grund')).toBeVisible();
    await confirm.click();

    await expect(dialog.getByRole('alert')).toContainText('sicher abgefangen');
    expect(captured).toHaveLength(1);
    expect(captured[0].routeId).toBeGreaterThan(0);
    expect(Number.isInteger(captured[0].routeId)).toBe(true);
    expect(captured[0]).toMatchObject({
      method: 'PATCH',
      body: {
        action: 'knockout',
        causedBy: selectedPlayer,
        reason: null,
      },
    });
  });

  test('entfernt einen kompletten Link über Teamplatz null aus dem Team', async ({ page }) => {
    const captured = await interceptEncounterLinkMutations(page);
    await openAdminSurface(page, '/tabelle');

    await firstTableRouteLink(page);
    const teamRow = tableRows(page).filter({ hasText: /Im Team · Platz \d/ }).first();
    test.skip(
      (await teamRow.count()) === 0,
      'Der aktuelle Spielstand enthält keinen Route-Link mit Teamplatz.',
    );
    const trigger = routeLinkTrigger(teamRow);
    await skipWithoutRouteLink(trigger, 'Die Tabelle');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole('menu', { name: /Route verwalten/i });
    await menu.getByRole('menuitem', { name: 'Aus Team entfernen' }).click();

    const dialog = page.getByRole('dialog', { name: 'Route aus dem Team entfernen' });
    await dialog.getByRole('button', { name: 'Aus Team entfernen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('sicher abgefangen');

    expect(captured).toHaveLength(1);
    expect(captured[0].routeId).toBeGreaterThan(0);
    expect(captured[0]).toMatchObject({
      method: 'PATCH',
      body: { action: 'set-team-slot', teamSlot: null },
    });
  });

  test.describe('mobil', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('öffnet den Linkdialog per Tastatur ohne Seitenüberlauf und schließt mit Escape', async ({
      page,
    }) => {
      await openAdminSurface(page, '/tabelle');

      const { trigger } = await firstTableRouteLink(page);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      await trigger.press('ArrowDown');
      const menu = page.getByRole('menu', { name: /Route verwalten/i });
      await expect(menu).toBeVisible();
      await menu.getByRole('menuitem', { name: 'Teamplatz verwalten' }).click();

      const dialog = page.getByRole('dialog', { name: 'Teamplatz verwalten' });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      const pageWidths = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(pageWidths.document).toBeLessThanOrEqual(pageWidths.viewport);

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });
});
