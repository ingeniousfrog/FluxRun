import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

const E2E_SEED = 228;

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

test('renders a nonblank racing canvas and moves the vehicle', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`/?seed=${E2E_SEED}`);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#guide-title')).toContainText('任意赛道');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.waitForTimeout(1200);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position ?? { x: 0, y: 0, z: 0 });

  await page.keyboard.press('Enter');
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('race');

  if (testInfo.project.name.includes('mobile')) {
    await page.locator('#boost-button').dispatchEvent('pointerdown');
    await page.locator('#touch-stick').dispatchEvent('pointerdown', { clientX: 120, clientY: 520 });
    await page.locator('#touch-stick').dispatchEvent('pointermove', { clientX: 120, clientY: 420 });
  } else {
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
  }

  await page.waitForTimeout(2200);

  await expect
    .poll(async () =>
      page.evaluate((initial) => {
        const current = window.__THREE_GAME_DIAGNOSTICS__?.player.position ?? { x: 0, y: 0, z: 0 };
        return Math.hypot(current.x - initial.x, current.z - initial.z);
      }, before),
    )
    .toBeGreaterThan(2);

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-racing`, {
    body: screenshot,
    contentType: 'image/png',
  });

  if (!testInfo.project.name.includes('mobile')) {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
