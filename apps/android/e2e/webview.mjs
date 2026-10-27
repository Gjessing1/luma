import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP(process.env.LUMA_CDP_URL ?? 'http://127.0.0.1:9228', {
  noDefaults: true,
});
const origin = process.env.LUMA_ANDROID_TEST_ORIGIN ?? 'http://10.0.2.2:3097';
const adb = process.env.ADB ?? '/home/gjessing/android-sdk/platform-tools/adb';
let page;
async function reconnect() {
  // Applying a wallpaper can trigger several dynamic-color Activity recreations.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const candidate = browser
      .contexts()[0]
      .pages()
      .find((entry) => entry.url().startsWith(origin));
    if (!candidate) continue;
    try {
      await candidate.locator('main').waitFor({ timeout: 2000 });
      await candidate.waitForTimeout(5000);
      if (candidate.isClosed()) continue;
      page = candidate;
      page.setDefaultTimeout(20000);
      return;
    } catch (error) {
      if (!/closed|destroyed|navigation|Timeout/i.test(error.message)) throw error;
    }
  }
  throw new Error('Expected the replacement test WebView');
}
async function action(operation) {
  try {
    await operation();
  } catch (error) {
    if (!/closed|destroyed|navigation/i.test(error.message)) throw error;
  }
  await reconnect();
}
async function state() {
  return page.evaluate(() => window.Capacitor.Plugins.Wallpaper.getState());
}
async function generations() {
  return execFileSync(adb, ['shell', 'run-as', 'io.gjessing.luma', 'ls', 'files/wallpapers'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
async function openPlaylists() {
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('heading', { name: 'Now showing' }).waitFor();
}
async function selectPlaylist(name) {
  await page
    .getByRole('group', { name: 'Saved playlists' })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
}
async function addFromLibrary(playlist, names) {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Add to playlist').selectOption({ label: playlist });
  for (const name of names) {
    const add = page.getByRole('button', { name: `Add to ${playlist}: ${name}`, exact: true });
    if (await add.count()) await add.click();
  }
}
try {
  await reconnect();
  assert.equal(new URL(page.url()).hostname, '10.0.2.2', 'Never run this against production');
  // A rotation saved by 0.1.3 moves into the slot for its screen.
  let current = await state();
  console.log('Initial native rotations:', Object.keys(current.rotations));
  assert.equal(current.supportsPlaylists, true);
  assert.equal(current.config, undefined);
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    for (const slot of ['home', 'lock']) await plugin.stop({ slot });
    for (const key of ['luma.phone', 'luma.rotation']) localStorage.removeItem(key);
  });
  await page.reload();
  await page.locator('main').waitFor();
  if (await page.getByRole('dialog').count())
    await page.getByRole('button', { name: 'Close preview' }).click();
  await addFromLibrary('My playlist', ['Emerald tide', 'Blue hour']);
  await page.getByRole('button', { name: 'Preview Emerald tide', exact: true }).click();
  for (const [panel, action] of [
    ['◐ Style', () => page.getByRole('button', { name: 'AMOLED night', exact: true }).click()],
    // Starter art is screen-shaped, so zoom in to give it room to move.
    ['⤢ Frame', () => page.getByLabel('Zoom ·').fill('150')],
  ]) {
    const button = page.getByRole('button', { name: panel, exact: true });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await action();
  }
  await page.getByLabel('Horizontal position').fill('75');
  execFileSync(adb, ['shell', 'input', 'keyevent', '4']);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await openPlaylists();
  execFileSync(adb, ['shell', 'input', 'keyevent', '4']);
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
  await openPlaylists();
  await page.getByLabel('Galaxy profile').selectOption('s25');
  await page.getByLabel('Show on').selectOption('home');
  await page.getByLabel('Change wallpaper').selectOption('interval');
  await page.getByLabel('Every').selectOption('15');
  await action(() => page.getByRole('button', { name: 'Start on home screen' }).click());
  current = await state();
  let home = current.rotations.home;
  assert.equal(home.config.ids.length, 2);
  assert.equal(home.config.device, 's25');
  assert.equal(home.config.name, 'My playlist');
  assert.ok(Object.values(home.config.styles).some((style) => style.zoom === 150));
  assert.equal(home.config.enabled, true);
  assert.ok(home.nextAt > Date.now());
  assert.equal(current.rotations.lock, undefined);
  console.log('Android Back, home playlist start and per-image settings passed.');
  const [generation] = await generations();
  assert.match(generation, /^[0-9a-f-]+$/);
  for (const id of home.config.ids) {
    const style = home.config.styles[id] ?? {
      focalX: 50,
      focalY: 50,
      effects: { dim: 0, blur: 0, warmth: 0, grayscale: false },
    };
    const query = new URLSearchParams({
      device: 's25',
      x: String(style.focalX),
      y: String(style.focalY),
      zoom: String(style.zoom ?? 100),
      dim: String(style.effects.dim),
      blur: '0',
      warmth: '0',
      grayscale: '0',
    });
    const expected = await fetch(
      `${origin.replace('10.0.2.2', '127.0.0.1')}/api/wallpapers/${id}/image?${query}`,
    );
    const cached = execFileSync(
      adb,
      ['exec-out', 'run-as', 'io.gjessing.luma', 'cat', `files/wallpapers/${generation}/${id}.jpg`],
      { maxBuffer: 25 * 1024 * 1024 },
    );
    assert.equal(
      createHash('sha256').update(cached).digest('hex'),
      createHash('sha256')
        .update(Buffer.from(await expected.arrayBuffer()))
        .digest('hex'),
      'Native cache must match each image’s own adjustments',
    );
  }
  console.log('Native cached JPEGs match each wallpaper’s adjusted render.');

  // A second, lock-only playlist runs beside the home playlist.
  await page.getByRole('button', { name: '+ New playlist' }).click();
  await page.getByLabel('Playlist name').fill('Night lock');
  await page.getByLabel('Playlist name').blur();
  await page.getByLabel('Show on').selectOption('lock');
  await page.getByLabel('Change wallpaper').selectOption('daily');
  await addFromLibrary('Night lock', ['Moon garden', 'Lavender drift']);
  await openPlaylists();
  await page.getByRole('heading', { name: 'Night lock', exact: true }).waitFor();
  assert.equal(await page.locator('.replace-note').count(), 0);
  await action(() => page.getByRole('button', { name: 'Start on lock screen' }).click());
  current = await state();
  assert.equal(current.rotations.lock.config.name, 'Night lock');
  assert.equal(current.rotations.lock.config.mode, 'daily');
  assert.equal(current.rotations.home.config.name, 'My playlist');
  assert.equal(current.rotations.home.config.enabled, true);
  assert.equal((await generations()).length, 2, 'Each screen keeps its own cache');
  await openPlaylists();
  assert.match(await page.locator('[data-screen=home]').innerText(), /My playlist\s*Running/);
  assert.match(await page.locator('[data-screen=lock]').innerText(), /Night lock\s*Running/);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/android-playlists.png', fullPage: true });
  console.log('Home and lock playlists run side by side.');

  const initial = current.rotations.home.lastId;
  const lockBefore = current.rotations.lock;
  await action(() =>
    page.evaluate(() => window.Capacitor.Plugins.Wallpaper.next({ slot: 'home' })),
  );
  current = await state();
  assert.notEqual(current.rotations.home.lastId, initial);
  assert.equal(current.rotations.lock.lastId, lockBefore.lastId, 'Next on home leaves lock alone');
  const failed = await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const before = await plugin.getState();
    try {
      await plugin.configure({
        config: { ...before.rotations.lock.config, ids: ['00000000-0000-0000-0000-000000000000'] },
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(failed, true);
  assert.deepEqual((await state()).rotations.lock.config, lockBefore.config);
  assert.equal((await generations()).length, 2, 'A failed download leaves both caches');
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const current = await plugin.getState();
    const config = current.rotations.home.config;
    await plugin.exportImage({ id: config.ids[0], config });
  });
  await openPlaylists();
  await page.locator('[data-screen=home]').getByRole('button', { name: 'Pause' }).click();
  await page.locator('[data-screen=home]').getByText('Paused', { exact: true }).waitFor();
  current = await state();
  assert.equal(current.rotations.home.config.enabled, false);
  assert.equal(current.rotations.home.nextAt, undefined);
  assert.equal(current.rotations.lock.config.enabled, true, 'Pausing home keeps lock running');

  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Emerald tide', exact: true }).click();
  const style = page.getByRole('button', { name: '◐ Style', exact: true });
  if ((await style.getAttribute('aria-expanded')) !== 'true') await style.click();
  await page.getByRole('button', { name: 'AMOLED night', exact: true }).click();
  for (const target of ['home', 'lock', 'both']) {
    await page.getByLabel('Apply wallpaper to').selectOption(target);
    await action(() => page.getByRole('button', { name: /^Apply to / }).click());
    console.log(`Applied ${target}; checking restored preview.`);
    await page.getByRole('dialog').waitFor();
  }
  current = await state();
  assert.equal(current.rotations.home.config.enabled, false);
  assert.equal(current.rotations.lock.config.enabled, true, 'One-off applies keep playlists');
  assert.ok(current.lastApplied);
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: 'test-results/android-preview.png' });
  await page.getByRole('button', { name: 'Close preview' }).click();

  // Making the home playlist Home & lock stops the lock playlist.
  await page.reload();
  await openPlaylists();
  assert.equal(await page.getByLabel('Galaxy profile').inputValue(), 's25');
  await selectPlaylist('My playlist');
  await page.getByLabel('Show on').selectOption('both');
  await page.getByText('Changed since it started').waitFor();
  assert.match(await page.locator('.replace-note').innerText(), /stops “Night lock”/);
  await action(() => page.getByRole('button', { name: 'Save & resume' }).click());
  current = await state();
  assert.equal(current.rotations.home.config.target, 'both');
  assert.equal(current.rotations.lock, undefined);
  assert.equal((await generations()).length, 1, 'The stopped playlist’s cache is removed');
  await openPlaylists();
  assert.match(
    await page.locator('[data-screen=lock]').innerText(),
    /Same playlist as the home screen/,
  );
  await page.evaluate(() => window.Capacitor.Plugins.Wallpaper.pause({ slot: 'home' }));
  console.log(
    'Android WebView passed: 0.1.3 migration, home and lock playlists side by side, per-slot next/pause, failed-sync rollback, Gallery export, one-off applies, Home & lock replacement and state restored after Activity recreation.',
  );
} finally {
  await browser.close();
}
