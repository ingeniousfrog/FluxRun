import { expect, test } from '@playwright/test';

test('meta HUD reads persisted racing localStorage values', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fluxrun-racing-meta', JSON.stringify({
      runs: 7,
      bestTime: 83.42,
    }));
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5);

  await expect(page.locator('#meta-runs')).toHaveText('7');
  await expect(page.locator('#meta-best')).toContainText('01:');
});
