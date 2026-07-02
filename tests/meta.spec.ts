import { expect, test } from '@playwright/test';

test('meta HUD reads persisted localStorage values', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fluxrun_meta_v1', JSON.stringify({
      bestScore: 42000,
      bestSector: 2,
      runsPlayed: 7,
      unlockedRelicIds: ['skip-free'],
      lastDailySeed: '20260702',
      lastDailyScore: 1200,
    }));
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5);

  await expect(page.locator('#meta-best')).toHaveText('042000');
  await expect(page.locator('#meta-runs')).toHaveText('7');
  await expect(page.locator('#meta-daily')).toContainText('1200');
});
