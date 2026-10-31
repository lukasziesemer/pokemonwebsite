import { expect, test, type Page } from '@playwright/test';
import { expandAllRoutes } from './fixtures';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

test.skip(
  !adminUsername || !adminPassword,
  'ADMIN_USERNAME und ADMIN_PASSWORD fehlen; ein echter Admin-Login kann nicht sicher geprüft werden.',
);

/** Fängt jede Erfassung ab: Die Tests prüfen den Ablauf, nicht den gemeinsamen Spielstand. */
async function interceptCaptures(page: Page) {
  const requests: unknown[] = [];
  const intercept = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'E2E: Änderung sicher abgefangen' }),
    });
  };
  await page.route(/\/api\/admin\/encounter-links\/\d+\/capture$/, intercept);
  await page.route(/\/api\/admin\/encounters$/, intercept);
  return requests;
}

async function openPanel(page: Page) {
  await page.goto('/pokeroute');
  const panel = page.getByRole('form', { name: 'Fang erfassen' });
  await expect(panel).toBeVisible();
  const search = panel.getByRole('combobox', { name: /^Pokémon für / });
  test.skip((await search.count()) === 0, 'Der aktuelle Spielstand enthält keine offene Route.');
  return { panel, search };
}

test('wählt die nächste offene Route und zeigt bereits erfasste Spieler', async ({ page }) => {
  const { panel } = await openPanel(page);

  await expect(panel.getByLabel('Route', { exact: true })).toHaveValue(/\d+/);
  await expect(panel.getByText(/^Bereits erfasst: /)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Fang speichern' })).toBeDisabled();
  await expect(panel.getByText('Wähle mindestens ein Pokémon aus.')).toBeVisible();
});

test('erfasst per Tastatur und schickt alles in einem Aufruf', async ({ page }) => {
  const requests = await interceptCaptures(page);
  const { panel, search } = await openPanel(page);

  await search.first().fill('glu');
  const hits = panel.getByRole('listbox').getByRole('option');
  await expect(hits).toHaveCount(2);
  await search.first().press('ArrowDown');
  await expect(hits.nth(1)).toHaveAttribute('aria-selected', 'true');
  await search.first().press('Enter');
  await expect(panel.getByText('Glutexo')).toBeVisible();

  const submit = panel.getByRole('button', { name: 'Fang speichern' });
  await expect(submit).toBeFocused();
  await panel.getByRole('textbox', { name: /^Spitzname für / }).fill('Flamme');
  await panel.getByRole('radio', { name: 'Ins Team' }).check();
  const slot = await panel.getByLabel('Teamplatz').inputValue();
  await expect(panel.getByLabel('Teamplatz').locator('option:checked')).toHaveText(/· frei$/);
  await submit.click();

  await expect.poll(() => requests).toEqual([
    {
      catches: [expect.objectContaining({ nickname: 'Flamme' })],
      outcome: { type: 'team', teamSlot: Number(slot) },
    },
  ]);
  await expect(panel.getByRole('alert')).toHaveText('E2E: Änderung sicher abgefangen');
  await expect(panel.getByText('Glutexo')).toBeVisible();
});

test('verlangt für „Nicht gefangen“ einen Verantwortlichen', async ({ page }) => {
  const requests = await interceptCaptures(page);
  const { panel, search } = await openPanel(page);

  await search.first().fill('1');
  await search.first().press('Enter');
  await panel.getByRole('radio', { name: 'Nicht gefangen' }).check();

  const submit = panel.getByRole('button', { name: 'Fang speichern' });
  await expect(submit).toBeDisabled();
  await panel.getByRole('button', { name: 'Spieler Rot' }).click();
  await panel.getByLabel('Grund').fill('Geflohen');
  await submit.click();

  await expect.poll(() => requests).toEqual([
    {
      catches: [expect.objectContaining({ pokemonId: expect.any(Number) })],
      outcome: { type: 'not-caught', causedBy: 'Spieler Rot', reason: 'Geflohen' },
    },
  ]);
});

test('übernimmt in der Routenzeile den ersten Treffer mit Enter', async ({ page }) => {
  const requests = await interceptCaptures(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/pokeroute');
  await expandAllRoutes(page);

  const search = page.locator('.route-list-row').getByRole('combobox').first();
  test.skip((await search.count()) === 0, 'Der aktuelle Spielstand enthält keinen freien Platz.');
  await search.fill('bisa');
  await expect(page.locator('.route-list-row').getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await search.press('Escape');
  await expect(page.locator('.route-list-row').getByRole('option')).toHaveCount(0);
  await search.press('Enter');
  await search.press('Enter');

  await expect.poll(() => requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ pokemonId: expect.any(Number) });
});

test.describe('bei 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('passt das Panel ohne Seitenüberlauf in die Breite', async ({ page }) => {
    const { panel } = await openPanel(page);
    await panel.getByRole('radio', { name: 'Nicht gefangen' }).check();

    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
});
