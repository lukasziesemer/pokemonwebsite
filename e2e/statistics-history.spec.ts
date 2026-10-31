import { expect, test } from '@playwright/test';
import { installStatisticsMocks } from './fixtures';

test.describe('Statistikfilter und Run-Historie', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('filtert nach Spiel und lädt die nächste History-Seite nach', async ({ page }) => {
    const { historyRequests } = await installStatisticsMocks(page);
    await page.goto('/statistik');

    await expect(page.getByRole('heading', { name: 'Statistik', exact: true })).toBeVisible();
    const filter = page.getByRole('group', { name: 'Statistik nach Spiel filtern' });
    const blueFilter = filter.getByRole('button', { name: 'Pokémon Blau' });
    await blueFilter.click();

    await expect(page).toHaveURL(/game=red-blue/);
    await expect(blueFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Pokémon Blau auf einen Blick' })).toBeVisible();

    const loadMore = page.getByRole('button', { name: 'Weitere Runs anzeigen (1 verbleibend)' });
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect(page.getByRole('button', { name: /Run #3/ })).toBeVisible();
    await expect(loadMore).toBeHidden();
    expect(historyRequests.some((request) => request.includes('cursor=102'))).toBe(true);
  });
});
