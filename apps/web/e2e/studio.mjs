import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const directory = await mkdtemp(join(tmpdir(), 'luma-browser-'));
const port = process.env.LUMA_TEST_PORT ?? '3098';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['backend/dist/index.js'], {
  env: {
    ...process.env,
    PORT: port,
    HOST: '127.0.0.1',
    LUMA_DATA_DIR: directory,
    LUMA_WEB_ROOT: join(process.cwd(), 'apps/web/dist'),
    LOG_LEVEL: 'silent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      await fetch(`${origin}/api/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByText('No wallpapers yet.').waitFor();
  await page.getByRole('button', { name: 'Add abstract backgrounds' }).click();
  await page.locator('.wallpaper-card').nth(5).waitFor();
  assert.equal(await page.locator('.wallpaper-card').count(), 6);
  await page
    .locator('.wallpaper-image img')
    .first()
    .evaluate((img) => img.decode());
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  await page.getByRole('searchbox').fill('Emerald');
  assert.equal(await page.locator('.wallpaper-card').count(), 1);
  await page.getByRole('button', { name: 'Favorite Emerald tide', exact: true }).click();
  await page.getByRole('button', { name: 'Unfavorite Emerald tide', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add to playlist: Emerald tide', exact: true }).click();
  await page.getByRole('searchbox').fill('Blue hour');
  await page.getByRole('button', { name: 'Add to playlist: Blue hour', exact: true }).click();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'My playlist' }).click();
  assert.equal(await page.locator('.wallpaper-card').count(), 2);
  await page.getByRole('button', { name: 'Move Blue hour earlier' }).click();
  assert.equal(await page.locator('.card-info h3').first().innerText(), 'Blue hour');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByLabel('Galaxy profile').selectOption('s25');
  await page.getByLabel('Change wallpaper').selectOption('daily');
  await page.getByLabel('Daily times', { exact: true }).fill('08:00, 22:00');
  await page.getByLabel('Apply to').focus();
  await page.getByRole('button', { name: 'Library', exact: false }).click();
  await page.getByRole('button', { name: 'Preview Emerald tide' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'AMOLED night' }).click();
  await page.locator('.phone-preview img').evaluate((img) => img.decode());
  assert.match(await page.locator('.phone-preview img').getAttribute('src'), /dim=35/);
  await page.getByLabel('Horizontal position').fill('75');
  await page.getByLabel('Vertical position').fill('20');
  await page.getByRole('button', { name: 'Reset position', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  await page.getByRole('button', { name: 'Undo adjustment', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  assert.equal(await page.getByLabel('Vertical position').inputValue(), '20');
  await page.getByRole('button', { name: 'Reset all adjustments', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '0');
  await page.getByRole('button', { name: 'Undo adjustment', exact: true }).click();
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '35');
  await page.getByRole('button', { name: 'Widgets', exact: true }).click();
  await page.locator('.preview-music').waitFor();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.locator('.clock').waitFor();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  assert.equal(await page.locator('.preview-apps, .clock').count(), 0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Preview Blue hour' }).click();
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '0');
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Preview Emerald tide' }).click();
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '35');
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  await page.reload();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '35');
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  const download = await page.request.get(
    new URL(await page.getByRole('link', { name: 'Download image' }).getAttribute('href'), origin)
      .href,
  );
  assert.equal(download.status(), 200);
  assert.deepEqual(
    await sharp(await download.body())
      .metadata()
      .then((m) => [m.width, m.height]),
    [1080, 2340],
  );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.screenshot({ path: 'test-results/galaxy-s25-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Close preview' }).click();
  const image = await sharp({
    create: { width: 1440, height: 3120, channels: 3, background: '#578875' },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'Test woodland.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Preview Test woodland' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'My playlist' }).click();
  await page.locator('.wallpaper-card').nth(1).waitFor();
  assert.equal(await page.locator('.wallpaper-card').count(), 2);
  await page.getByRole('button', { name: 'Library', exact: false }).click();
  await page.getByRole('button', { name: 'Preview Test woodland' }).click();
  await page.getByLabel('Wallpaper name').fill('Test renamed');
  await page.getByRole('heading', { name: 'Galaxy styling' }).click();
  await page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Test renamed', exact: true })
    .waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.wallpaper-card').count(), 6);
  for (const [name, width, height] of [
    ['s24-ultra', 384, 832],
    ['s25', 360, 780],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/studio-${name}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name} must not overflow`,
    );
  }
  await page.getByRole('button', { name: 'My playlist' }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.goBack();
  await page.getByRole('heading', { name: 'Playlist', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
  // Browser install link is quiet; Android only offers a download for a newer installed version.
  await page.route('**/api/app/version', (route) =>
    route.fulfill({ json: { versionCode: 1, versionName: '0.1.0', bytes: 3000000 } }),
  );
  await page.reload();
  await page.getByRole('link', { name: 'Android APK' }).waitFor();
  assert.equal(await page.locator('.collection-banner, .android-panel').count(), 0);
  const nativePage = await browser.newPage({ viewport: { width: 384, height: 832 } });
  await nativePage.addInitScript(() => {
    window.Capacitor = {
      Plugins: {
        AppShell: {
          getInfo: async () => ({ versionCode: 1, versionName: '0.1.0' }),
          downloadUpdate: async (options) => {
            window.testDownload = options;
          },
        },
        Wallpaper: {
          getState: async () => ({ model: 'SM-S928B', supportsStyles: true }),
          apply: async (options) => {
            window.testApply = options.config;
            return {};
          },
        },
      },
    };
  });
  await nativePage.route('**/api/app/version', (route) =>
    route.fulfill({ json: { versionCode: 2, versionName: '0.2.0', bytes: 3000000 } }),
  );
  await nativePage.goto(origin);
  await nativePage.getByText('Update 0.2.0 available.').waitFor();
  assert.equal(await nativePage.locator('a[href="/api/app/download"]').count(), 0);
  assert.equal(await nativePage.getByText('Get the Android app').count(), 0);
  await nativePage.getByRole('button', { name: 'Download update', exact: true }).click();
  assert.match((await nativePage.evaluate(() => window.testDownload)).url, /\/api\/app\/download$/);
  await nativePage.screenshot({ path: 'test-results/android-no-promotion.png', fullPage: true });
  await nativePage.getByRole('button', { name: 'Preview Emerald tide' }).click();
  for (const target of ['home', 'lock', 'both']) {
    await nativePage.getByLabel('Apply wallpaper to').selectOption(target);
    await nativePage.getByRole('button', { name: /^Apply to / }).click();
    await nativePage.waitForFunction((expected) => window.testApply?.target === expected, target);
    assert.equal((await nativePage.evaluate(() => window.testApply)).effects.dim, 0);
  }
  await nativePage.getByRole('button', { name: 'Close preview' }).click();
  await nativePage.getByRole('dialog').waitFor({ state: 'hidden' });
  await nativePage.close();
  assert.deepEqual(errors, []);
  console.log(
    'Browser verification passed: import, library, crop/effects, playlist, both Galaxy viewports, persistence, rename and deletion.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  await rm(directory, { recursive: true, force: true });
}
