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

  const meta = await page.evaluate(() => localStorage.getItem('fluxrun-racing-meta'));
  expect(meta).toContain('"runs":7');
  expect(meta).toContain('83.42');
  await expect(page.locator('#sector-label')).not.toHaveText('TRACK');
});
