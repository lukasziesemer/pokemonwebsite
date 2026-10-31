import { expect, test, type Locator, type Page } from '@playwright/test';

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

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

function encounterActionTriggers(page: Page) {
  return page
    .locator('tbody td')
    .getByRole('button', { name: /\S+ verwalten$/i });
}

async function skipWithoutEncounterAction(trigger: Locator, surface: string) {
  test.skip(
    (await trigger.count()) === 0,
    `${surface} enthält im aktuellen Spielstand keinen verwaltbaren Encounter.`,
  );
}

async function textContrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const parseColor = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        red: channels[0] ?? 0,
        green: channels[1] ?? 0,
        blue: channels[2] ?? 0,
        alpha: channels[3] ?? 1,
      };
    };
    const luminance = (red: number, green: number, blue: number) => {
      const normalize = (channel: number) => {
        const value = channel / 255;
        return value <= 0.03928
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * normalize(red) +
        0.7152 * normalize(green) +
        0.0722 * normalize(blue)
      );
    };

    const foreground = parseColor(getComputedStyle(element).color);
    let backgroundElement: Element | null = element;
    let background = parseColor('rgb(255, 255, 255)');
    while (backgroundElement) {
      const candidate = parseColor(getComputedStyle(backgroundElement).backgroundColor);
      if (candidate.alpha >= 0.95) {
        background = candidate;
        break;
      }
      backgroundElement = backgroundElement.parentElement;
    }

    const foregroundLuminance = luminance(
      foreground.red,
      foreground.green,
      foreground.blue,
    );
    const backgroundLuminance = luminance(
      background.red,
      background.green,
      background.blue,
    );
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test.describe('Öffentlicher Login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('hält Login-Texte und Felder im Darkmode lesbar', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/login');

    await expect(page.locator('html')).toHaveClass(/dark/);
    const heading = page.getByRole('heading', { name: 'Anmelden' });
    const usernameLabel = page.getByText('Benutzername', { exact: true });
    const usernameInput = page.getByLabel('Benutzername');
    await expect(heading).toBeVisible();
    await expect(usernameLabel).toBeVisible();
    await expect(usernameInput).toBeVisible();

    expect(await textContrastRatio(heading)).toBeGreaterThanOrEqual(4.5);
    expect(await textContrastRatio(usernameLabel)).toBeGreaterThanOrEqual(4.5);
    expect(await textContrastRatio(usernameInput)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('Administration', () => {
  test('leitet einen bereits eingeloggten Admin von Login weiter und zeigt Admin sofort', async ({
    page,
  }) => {
    await openAdminSurface(page, '/pokeroute');

    const adminLink = page.getByRole('link', { name: 'Admin', exact: true }).first();
    await expect(adminLink).toBeVisible();
    await page.goto('/login?redirect=%2Ftabelle');

    await expect.poll(() => new URL(page.url()).pathname).toBe('/tabelle');
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Admin', exact: true }).first()).toBeVisible();
  });

  test('bedient Tabellenfilter und begrenzt das Zellmenü auf Pokémon-Daten', async ({ page }) => {
    await openAdminSurface(page, '/tabelle');

    await expect(page.getByRole('heading', { name: 'Encounter-Tabelle' })).toBeVisible();
    const teamFilter = page.getByLabel('Teamstatus');
    const statusFilter = page.getByLabel('Encounter-Status');
    const resetFilters = page.getByRole('button', { name: 'Filter zurücksetzen' });
    await teamFilter.selectOption('not-in-team');
    await statusFilter.selectOption('active');
    await expect(teamFilter).toHaveValue('not-in-team');
    await expect(statusFilter).toHaveValue('active');
    await expect(resetFilters).toBeEnabled();
    await resetFilters.click();
    await expect(teamFilter).toHaveValue('all');
    await expect(statusFilter).toHaveValue('all');

    const trigger = encounterActionTriggers(page).first();
    await skipWithoutEncounterAction(trigger, 'Die Tabelle');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const menu = page.getByRole('menu', { name: /verwalten/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Pokémon tauschen' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Spitzname bearbeiten' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Entwicklung ändern' })).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Pokémon tauschen',
      'Spitzname bearbeiten',
      'Entwicklung ändern',
    ]);
  });

  test.describe('mobil', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('zeigt den Admin-Einstieg im Mehr-Menü', async ({ page }) => {
      await openAdminSurface(page, '/pokeroute');

      const navigation = page.getByRole('navigation', { name: 'Hauptnavigation mobil' });
      const moreButton = navigation.getByRole('button', { name: 'Mehr' });
      await moreButton.click();
      const moreDialog = page.getByRole('dialog', { name: 'Mehr' });
      await expect(moreDialog.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
    });

  });
});
