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
  // Adjustments open from the tool bar under the phone; one panel shows at a time.
  async function tool(name) {
    const button = page.getByRole('button', { name, exact: true });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  }
  await tool('◐ Style');
  await page.getByRole('button', { name: 'AMOLED night' }).click();
  await page.waitForFunction(() =>
    document.querySelector('.phone-preview img.exact-render')?.src.includes('dim=35'),
  );
  await page.locator('.phone-preview img.exact-render').evaluate((img) => img.decode());
  await tool('⤢ Frame');
  // Starter art is exactly screen-shaped: it can only move after zooming in.
  assert.equal(await page.getByLabel('Horizontal position').isDisabled(), true);
  await page.getByText('already fits the screen exactly').waitFor();
  await page.getByLabel('Zoom ·').fill('150');
  await page.getByLabel('Horizontal position').fill('75');
  await page.getByLabel('Vertical position').fill('20');
  await page.getByRole('button', { name: 'Reset framing', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  assert.equal(await page.getByLabel('Zoom ·').inputValue(), '100');
  await page.getByRole('button', { name: 'Undo adjustment', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  assert.equal(await page.getByLabel('Vertical position').inputValue(), '20');
  assert.equal(await page.getByLabel('Zoom ·').inputValue(), '150');
  // Dragging the picture left reveals its right side; the whole drag is one undo step.
  const phone = await page.locator('.phone-preview').boundingBox();
  await page.mouse.move(phone.x + phone.width / 2, phone.y + phone.height / 2);
  await page.mouse.down();
  await page.mouse.move(phone.x + phone.width / 2 - 30, phone.y + phone.height / 2, { steps: 5 });
  await page.locator('.phone-preview img.source-layer:not([hidden])').waitFor();
  await page.mouse.up();
  assert.ok(Number(await page.getByLabel('Horizontal position').inputValue()) > 75);
  // The exact server render replaces the instant layer once it has loaded.
  await page.waitForFunction(
    () => document.querySelector('.phone-preview img.source-layer')?.hidden === true,
  );
  assert.match(
    await page.locator('.phone-preview img.exact-render').getAttribute('src'),
    /zoom=150/,
  );
  await page.getByRole('button', { name: 'Undo adjustment', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  await page.getByRole('button', { name: 'Reset all adjustments', exact: true }).click();
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  await tool('◐ Style');
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
  await tool('⤢ Frame');
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '50');
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Preview Emerald tide' }).click();
  // The last opened panel is remembered.
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  await tool('◐ Style');
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '35');
  await page.reload();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('Dim ·').inputValue(), '35');
  await tool('⤢ Frame');
  assert.equal(await page.getByLabel('Horizontal position').inputValue(), '75');
  assert.equal(await page.getByLabel('Zoom ·').inputValue(), '150');
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
  await page.getByRole('heading', { name: 'Set as wallpaper' }).click();
  await page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Test renamed', exact: true })
    .waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Preview Test renamed', exact: true })
    .waitFor({ state: 'hidden' });
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
  // Live wallpapers live under the Library's Live chip; there is no separate tab any more.
  assert.equal(await page.getByRole('button', { name: 'Live wallpaper', exact: true }).count(), 0);
  await page.locator('.filter-tabs button', { hasText: 'Live' }).click();
  // Generated scenes start folded away so the video collection leads.
  const aurora = page.getByRole('button', { name: 'Preview live wallpaper Aurora', exact: true });
  assert.equal(await aurora.isVisible(), false);
  await page.getByText('Generated scenes ·').click();
  assert.equal(await page.locator('.generated-scenes .wallpaper-card').count(), 3);
  await page
    .getByRole('button', { name: 'Preview live wallpaper Weather landscape', exact: true })
    .click();
  const liveDialog = page.getByRole('dialog', { name: 'Live wallpaper preview' });
  await liveDialog.waitFor();
  assert.equal(
    await liveDialog
      .getByRole('button', { name: 'Save & open Android preview', exact: true })
      .isDisabled(),
    true,
  );
  for (const weather of ['clear', 'clouds', 'rain', 'snow', 'storm', 'auto']) {
    await liveDialog.getByLabel('Weather source').selectOption(weather);
  }
  await liveDialog.getByLabel('Latitude', { exact: true }).fill('60.39');
  await liveDialog.getByLabel('Longitude', { exact: true }).fill('5.32');
  await page.reload();
  await liveDialog.waitFor();
  assert.equal(await liveDialog.getByLabel('Weather source').inputValue(), 'auto');
  assert.equal(await liveDialog.getByLabel('Latitude', { exact: true }).inputValue(), '60.39');
  await liveDialog.getByRole('heading', { name: 'Weather landscape', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'test-results/live-settings-mobile.png', fullPage: true });
  // Back closes the preview and keeps the Live chip.
  await page.goBack();
  await liveDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.filter-active').innerText(), '✧ Live 0');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
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
  for (const viewport of [
    { width: 384, height: 832 },
    { width: 1440, height: 1080 },
  ]) {
    await nativePage.setViewportSize(viewport);
    await nativePage.locator('.s24-home-overlay').waitFor();
    assert.equal(await nativePage.locator('.s24-home-app').count(), 10);
    assert.equal(await nativePage.locator('.s24-dock-icon').count(), 5);
    assert.equal(await nativePage.locator('.preview-widget').count(), 0);
    const phone = await nativePage.locator('.phone-preview').boundingBox();
    const photo = await nativePage.locator('.phone-preview img.exact-render').boundingBox();
    assert.ok(Math.abs(photo.width / photo.height - 1440 / 3120) < 0.0001);
    assert.ok(Math.abs(photo.height - phone.height) < 0.1, 'Frame must not recrop the image');
    // Anchors measured from the supplied One UI screenshot, as fractions of its height.
    for (const [selector, top] of [
      ['.s24-home-app >> nth=0', 0.5455],
      ['.s24-home-app >> nth=5', 0.6593],
      ['.s24-dock-icon >> nth=0', 0.8518],
    ]) {
      const box = await nativePage.locator(selector).boundingBox();
      assert.ok(Math.abs((box.y - phone.y) / phone.height - top) < 0.002);
    }
    await nativePage.screenshot({
      path: `test-results/s24-home-${viewport.width}.png`,
      fullPage: true,
    });
    await nativePage.getByRole('button', { name: 'Widgets', exact: true }).click();
    const widgetPhone = await nativePage.locator('.phone-preview').boundingBox();
    const widget = await nativePage.locator('.s24-widget-page').boundingBox();
    assert.ok(Math.abs((widget.x - widgetPhone.x) / phone.width - 0.2444) < 0.002);
    assert.ok(Math.abs((widget.y - widgetPhone.y) / phone.height - 0.1993) < 0.002);
    assert.ok(Math.abs(widget.width / phone.width - 0.6952) < 0.002);
    assert.ok(Math.abs(widget.height / phone.height - 0.4269) < 0.002);
    assert.equal(await nativePage.locator('.s24-home-app').count(), 0);
    assert.equal(await nativePage.locator('.s24-dock-icon').count(), 5);
    await nativePage.screenshot({
      path: `test-results/s24-widgets-${viewport.width}.png`,
      fullPage: true,
    });
    await nativePage.getByLabel('Extra agenda rows').fill('5');
    const busyWidget = await nativePage.locator('.s24-widget-page').boundingBox();
    const busyPhone = await nativePage.locator('.phone-preview').boundingBox();
    assert.ok(Math.abs((busyWidget.x - busyPhone.x) / phone.width - 0.2444) < 0.002);
    assert.ok(Math.abs((busyWidget.y - busyPhone.y) / phone.height - 0.1993) < 0.002);
    assert.ok(Math.abs(busyWidget.width - widget.width) < 0.1);
    assert.ok(busyWidget.height > widget.height);
    await nativePage.screenshot({
      path: `test-results/s24-busy-widgets-${viewport.width}.png`,
      fullPage: true,
    });
    await nativePage.getByLabel('Extra agenda rows').fill('0');
    await nativePage.getByRole('button', { name: 'Work', exact: true }).click();
    assert.equal(await nativePage.locator('.s24-work-app').count(), 10);
    assert.equal(await nativePage.locator('.s24-photo-widget').count(), 2);
    assert.equal(await nativePage.locator('.s24-widget-page').count(), 0);
    const photos = await nativePage.locator('.s24-photo-widget').first().boundingBox();
    assert.ok(Math.abs((photos.y - phone.y) / phone.height - 0.3126) < 0.002);
    assert.ok(Math.abs(photos.width / phone.width - 0.3249) < 0.002);
    assert.ok(Math.abs(photos.height / phone.height - 0.2071) < 0.002);
    assert.equal(
      await nativePage.locator('.phone-preview > img.exact-render').getAttribute('src'),
      await nativePage.getByRole('link', { name: 'Download image' }).getAttribute('href'),
    );
    await nativePage.screenshot({
      path: `test-results/s24-work-${viewport.width}.png`,
      fullPage: true,
    });
    await nativePage.getByRole('button', { name: 'Home', exact: true }).click();
  }
  await nativePage.getByRole('button', { name: 'Image', exact: true }).click();
  assert.equal(await nativePage.locator('.s24-home-overlay').count(), 0);
  await nativePage.getByRole('button', { name: 'Home', exact: true }).click();
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
