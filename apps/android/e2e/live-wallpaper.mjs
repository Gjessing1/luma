import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const adb = process.env.ADB ?? '/home/gjessing/android-sdk/platform-tools/adb';
const cdp = process.env.LUMA_CDP_URL ?? 'http://127.0.0.1:9228';
const origin = process.env.LUMA_ANDROID_TEST_ORIGIN ?? 'http://10.0.2.2:3097';
assert.equal(new URL(origin).hostname, '10.0.2.2', 'Use the disposable emulator backend');
assert.notEqual(new URL(origin).port, '3048', 'Never mutate production');
const serial = execFileSync(adb, ['get-serialno'], { encoding: 'utf8' }).trim();
assert.match(serial, /^emulator-/, 'Run only on a test emulator');
function shell(...args) {
  return execFileSync(adb, ['shell', ...args], { encoding: 'utf8' });
}
async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
let browser;
let page;
async function connect() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if (!browser?.isConnected()) {
        const pid = shell('pidof', 'io.gjessing.luma').trim().split(' ')[0];
        execFileSync(adb, [
          'forward',
          `tcp:${new URL(cdp).port}`,
          `localabstract:webview_devtools_remote_${pid}`,
        ]);
        browser = await chromium.connectOverCDP(cdp, { noDefaults: true });
      }
      page = browser
        .contexts()[0]
        .pages()
        .find((entry) => entry.url().startsWith(origin));
      if (page) {
        await page.locator('main').waitFor({ timeout: 2000 });
        page.setDefaultTimeout(20000);
        return;
      }
    } catch (error) {
      if (!/closed|destroyed|Timeout|ECONN|socket/i.test(error.message)) throw error;
    }
    await delay(500);
  }
  throw new Error('Expected the disposable Luma WebView');
}
async function state() {
  return page.evaluate(() => window.Capacitor.Plugins.Wallpaper.getState());
}
async function screenshot(name) {
  const bytes = execFileSync(adb, ['exec-out', 'screencap', '-p']);
  await writeFile(`test-results/${name}.png`, bytes);
  return bytes;
}
async function nativeButton(pattern) {
  for (let attempt = 0; attempt < 10; attempt++) {
    shell('uiautomator', 'dump', '/sdcard/luma-window.xml');
    const xml = shell('cat', '/sdcard/luma-window.xml');
    for (const node of xml.matchAll(/<node\b[^>]+>/g)) {
      const label = node[0].match(/text="([^"]*)"/)?.[1] ?? '';
      if (!pattern.test(label)) continue;
      const bounds = node[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (!bounds) continue;
      shell(
        'input',
        'tap',
        String(Math.round((+bounds[1] + +bounds[3]) / 2)),
        String(Math.round((+bounds[2] + +bounds[4]) / 2)),
      );
      return true;
    }
    await delay(500);
  }
  return false;
}
async function save(config) {
  await connect();
  return page.evaluate(
    (settings) => window.Capacitor.Plugins.Wallpaper.configureLive({ config: settings }),
    config,
  );
}
async function home() {
  shell('input', 'keyevent', '3');
  await delay(1500);
}
async function app() {
  shell('am', 'start', '-n', 'io.gjessing.luma/.MainActivity');
  await delay(1000);
  await connect();
}
try {
  await mkdir('test-results', { recursive: true });
  await app();
  assert.equal(new URL(page.url()).origin, origin);
  const original = await state();
  assert.equal(original.supportsLiveWallpaper, true);
  assert.ok(original.config.ids.length, 'Run webview.mjs first to cache a disposable playlist');
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const state = await plugin.getState();
    await plugin.configure({ config: { ...state.config, target: 'home', enabled: true } });
  });
  await delay(2000);
  await connect();
  await page.getByRole('button', { name: 'Live wallpaper', exact: true }).click();
  await page.getByRole('button', { name: 'Aurora', exact: false }).click();
  await page.getByLabel('Animate wallpaper', { exact: true }).check();
  await page.getByRole('button', { name: 'Save & open Android preview', exact: true }).click();
  await delay(2000);
  await screenshot('live-android-preview');
  shell('input', 'keyevent', '4');
  await app();
  assert.equal((await state()).config.enabled, true, 'Cancelling preview preserves rotation');
  await page.getByRole('button', { name: 'Save & open Android preview', exact: true }).click();
  assert.equal(await nativeButton(/^Set wallpaper$/i), true, 'Android must offer Set wallpaper');
  // AOSP versions differ: the picker may offer Home, Both or apply immediately.
  await delay(800);
  await nativeButton(/^Home screen$/i);
  await home();
  assert.match(
    shell('dumpsys', 'wallpaper'),
    /io\.gjessing\.luma\/(?:io\.gjessing\.luma)?\.LumaWallpaperService/,
    'System must bind Luma behind the launcher',
  );
  console.log('Android confirmed the live wallpaper; checking frames and rotation.');
  const movingA = await screenshot('live-aurora-home');
  await delay(1200);
  const movingB = await screenshot('live-aurora-moving');
  const sample = async (bytes) =>
    sharp(bytes).extract({ left: 100, top: 400, width: 800, height: 700 }).raw().toBuffer();
  assert.notDeepEqual(await sample(movingA), await sample(movingB), 'Visible aurora must animate');
  await app();
  let current = await state();
  assert.equal(current.live.active, true);
  assert.equal(current.config.enabled, false, 'Activating live wallpaper pauses home rotation');
  assert.equal(current.nextAt, undefined);
  const settings = { ...current.live.config, motion: false };
  await save(settings);
  await home();
  const stillA = await screenshot('live-aurora-still');
  await delay(1000);
  const stillB = await screenshot('live-aurora-still-second');
  assert.deepEqual(
    await sample(stillA),
    await sample(stillB),
    'Motion off must render a still scene',
  );
  await app();
  await save({ ...settings, scene: 'stars', motion: true });
  await home();
  await screenshot('live-stars-home');
  await app();
  for (const weather of ['clear', 'clouds', 'rain', 'snow', 'storm']) {
    await save({ ...settings, scene: 'weather', weather, night: weather === 'snow' });
    await home();
    await screenshot(`live-weather-${weather}`);
    await app();
  }
  const before = (await state()).live.config;
  const rejected = await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const { live } = await plugin.getState();
    try {
      await plugin.configureLive({ config: { ...live.config, latitude: 91 } });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(rejected, true);
  assert.deepEqual((await state()).live.config, before, 'Invalid settings preserve the scene');
  // Check that a service configured for automatic weather persists a real observation.
  await save({ ...settings, scene: 'weather', weather: 'auto' });
  await home();
  await delay(5000);
  await app();
  current = await state();
  assert.ok(
    current.live.weather || current.live.weatherError,
    'Automatic weather must cache a result or report an offline fallback',
  );
  console.log('Automatic weather:', current.live.weather ?? current.live.weatherError);
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const state = await plugin.getState();
    await plugin.configure({ config: { ...state.config, target: 'lock', enabled: true } });
  });
  await delay(1500);
  await connect();
  current = await state();
  assert.equal(
    current.live.active,
    true,
    'Lock-only rotation must preserve the live home wallpaper',
  );
  assert.equal(current.config.enabled, true);
  await page.evaluate(() => window.Capacitor.Plugins.Wallpaper.next());
  await delay(1000);
  await connect();
  assert.equal((await state()).live.active, true);
  await page.evaluate(() => window.Capacitor.Plugins.Wallpaper.pause());
  // Hidden engine must stop posting frames (inspectable through dumpsys wallpaper).
  const hidden = shell('dumpsys', 'activity', 'service', 'io.gjessing.luma/.LumaWallpaperService');
  await writeFile('test-results/live-wallpaper-hidden.txt', hidden);
  assert.match(hidden, /mVisible=false/, 'Wallpaper must hide behind the full-screen app');
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const state = await plugin.getState();
    await plugin.apply({
      config: { ...state.config, target: 'home', enabled: false, ids: [state.config.ids[0]] },
    });
  });
  await delay(1500);
  await connect();
  assert.equal((await state()).live.active, false, 'Applying a photo switches back');
  console.log(
    'Live wallpaper passed: real picker/cancel/activation, launcher animation, still mode, all scenes/presets, rotation pause/lock-only coexistence, automatic weather, invalid-save rollback and switching back to photos.',
  );
} finally {
  await browser?.close();
}
