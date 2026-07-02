import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: import('@playwright/test').Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }

  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }

  const variance = max - min;
  return {
    ok: alphaPixels > 256 && (variance > 8 || buckets.size > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

async function pressGameKey(page: import('@playwright/test').Page, code: string): Promise<void> {
  const keyByCode: Record<string, string> = {
    ArrowRight: 'ArrowRight',
    Enter: 'Enter',
    KeyE: 'e',
    Space: ' ',
    Tab: 'Tab',
  };
  await page.evaluate(
    ({ code: eventCode, key }) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: eventCode, key, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: eventCode, key, bubbles: true }));
    },
    { code, key: keyByCode[code] ?? code },
  );
  await page.waitForTimeout(60);
}

async function placeHorizontalRoute(page: import('@playwright/test').Page): Promise<void> {
  await pressGameKey(page, 'Space');

  for (let x = 2; x <= 14; x += 1) {
    await pressGameKey(page, 'ArrowRight');
    let pieceName = (await page.locator('#piece-value').textContent()) ?? '';

    if (pieceName.includes('Elbow')) {
      await pressGameKey(page, 'Tab');
      pieceName = (await page.locator('#piece-value').textContent()) ?? '';
    }

    if (pieceName.includes('T Split')) {
      await pressGameKey(page, 'KeyE');
    }

    await pressGameKey(page, 'Space');
  }
}

test('renders a nonblank interactive game canvas', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#guide-title')).toContainText('Connect source');
  await expect(page.locator('#guide-text')).toContainText('Water stays closed');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.waitForTimeout(1300);
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('build');

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position ?? { x: 0, y: 0, z: 0 });
  const firstPiece = await page.locator('#piece-value').textContent();

  if (testInfo.project.name.includes('mobile')) {
    await page.locator('#touch-actions [data-action="next"]').tap();
    await expect.poll(async () => page.locator('#piece-value').textContent()).not.toBe(firstPiece);
    await page.locator('#touch-actions [data-action="restart"]').tap();
    await expect(page.locator('#piece-value')).toContainText('Straight');
    await expect(page.locator('[data-action="rush"]')).toBeVisible();
    await page.locator('[data-action="rush"]').tap();
  } else {
    await page.keyboard.press('Tab');
    await expect.poll(async () => page.locator('#piece-value').textContent()).not.toBe(firstPiece);
    await page.keyboard.press('r');
    await expect(page.locator('#piece-value')).toContainText('Straight');
    await page.keyboard.press('Enter');
  }

  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('build');
  await expect(page.locator('#guide-title')).toContainText('Connect source');

  await placeHorizontalRoute(page);
  await expect(page.locator('#route-value')).toContainText('16/16');

  if (testInfo.project.name.includes('mobile')) {
    await page.locator('[data-action="rush"]').tap();
  } else {
    await page.keyboard.press('Enter');
  }

  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('flow');
  await page.waitForTimeout(1400);

  await expect
    .poll(async () =>
      page.evaluate((initial) => {
        const current = window.__THREE_GAME_DIAGNOSTICS__?.player.position ?? { x: 0, y: 0, z: 0 };
        return Math.hypot(current.x - initial.x, current.z - initial.z);
      }, before),
    )
    .toBeGreaterThan(0.45);

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-game`, {
    body: screenshot,
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
