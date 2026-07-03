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
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const isMobile = testInfo.project.name.includes('mobile');
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`/?seed=${E2E_SEED}`);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#sector-label')).toBeVisible();
  await expect(page.locator('#sector-label')).not.toHaveText('TRACK');
  await page.waitForTimeout(800);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });

  const cameraButton = page.locator('#touch-actions [data-action="camera"]');
  await cameraButton.dispatchEvent('pointerdown');
  await expect(page.locator('html')).toHaveClass(/cockpit-view/);
  await expect(page.locator('#race-hud')).toBeVisible();
  await expect(page.locator('#hud-header')).toBeVisible();
  await expect(page.locator('#dash-hud')).toBeVisible();

  await cameraButton.dispatchEvent('pointerdown');
  await expect(page.locator('html')).not.toHaveClass(/cockpit-view/);

  if (!isMobile) {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    return;
  }

  await page.locator('#go-button').click({ force: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('#race-start-overlay')).toHaveClass(/hidden/, { timeout: 12000 });

  await page.locator('#boost-button').dispatchEvent('pointerdown');
  await page.locator('#touch-stick').dispatchEvent('pointerdown', { clientX: 120, clientY: 520 });
  await page.locator('#touch-stick').dispatchEvent('pointermove', { clientX: 120, clientY: 420 });

  await page.waitForTimeout(2200);

  const speedText = await page.locator('#combo-value').textContent({ timeout: 2000 });
  expect(Number(speedText)).toBeGreaterThan(2);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
