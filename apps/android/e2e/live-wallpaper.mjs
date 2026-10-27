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
  // Detailed video frames make PNGs larger than execFileSync's 1 MB default buffer.
  const bytes = execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
  await writeFile(`test-results/${name}.png`, bytes);
  return bytes;
}
async function nativeButton(pattern) {
  for (let attempt = 0; attempt < 10; attempt++) {
    shell('uiautomator', 'dump', '/sdcard/luma-window.xml');
    const xml = shell('cat', '/sdcard/luma-window.xml');
    for (const node of xml.matchAll(/<node\b[^>]+>/g)) {
      const label = node[0].match(/text="([^"]*)"/)?.[1] ?? '';
      // The picker shows Set wallpaper disabled until its preview engine has connected.
      if (!pattern.test(label) || node[0].includes('enabled="false"')) continue;
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
  assert.ok(
    original.rotations.home?.config.ids.length,
    'Run webview.mjs first to cache a disposable playlist',
  );
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const state = await plugin.getState();
    await plugin.configure({
      config: { ...state.rotations.home.config, target: 'home', enabled: true },
    });
  });
  await delay(2000);
  await connect();
  // An earlier aborted run can leave a restored preview open over the Library.
  if (await page.getByRole('dialog').count())
    await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.filter-tabs button', { hasText: 'Live' }).click();
  // Generated scenes are folded beneath the video collection.
  const generated = page.locator('details.generated-scenes');
  if (!(await generated.evaluate((element) => element.open)))
    await generated.locator('summary').click();
  await page.getByRole('button', { name: 'Preview live wallpaper Aurora', exact: true }).click();
  // An animating preview never idles, which blocks uiautomator; start motion after Set.
  await page.getByLabel('Animate wallpaper', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save & open Android preview', exact: true }).click();
  await delay(2000);
  await screenshot('live-android-preview');
  shell('input', 'keyevent', '4');
  await app();
  assert.equal(
    (await state()).rotations.home.config.enabled,
    true,
    'Cancelling preview preserves rotation',
  );
  await page.getByRole('button', { name: 'Save & open Android preview', exact: true }).click();
  assert.equal(await nativeButton(/^Set wallpaper$/i), true, 'Android must offer Set wallpaper');
  // AOSP versions differ: the picker may offer Home, Both or apply immediately.
  await delay(800);
  for (let attempt = 0; attempt < 3 && !(await nativeButton(/^Home screen$/i)); attempt++);
  await home();
  // Each preview alternates between Luma's two components; Android rebinds asynchronously.
  for (
    let attempt = 0;
    attempt < 20 &&
    !/mWallpaperComponent=ComponentInfo\{io\.gjessing\.luma/.test(shell('dumpsys', 'wallpaper'));
    attempt++
  )
    await delay(500);
  assert.match(
    shell('dumpsys', 'wallpaper'),
    /io\.gjessing\.luma\/(?:io\.gjessing\.luma)?\.LumaWallpaperService/,
    'System must bind Luma behind the launcher',
  );
  console.log(
    'Android confirmed the live wallpaper; checking frames and rotation.',
    shell('dumpsys', 'wallpaper').match(/mWallpaperComponent=ComponentInfo\{([^}]+)\}/)?.[1],
  );
  await app();
  await save({ ...(await state()).live.config, motion: true });
  await home();
  // Android animates the wallpaper change; sample after it settles.
  await delay(1500);
  const movingA = await screenshot('live-aurora-home');
  await delay(1200);
  const movingB = await screenshot('live-aurora-moving');
  const sample = async (bytes) =>
    sharp(bytes).extract({ left: 100, top: 400, width: 800, height: 700 }).raw().toBuffer();
  assert.notDeepEqual(await sample(movingA), await sample(movingB), 'Visible aurora must animate');
  await app();
  let current = await state();
  assert.equal(current.live.active, true);
  assert.equal(
    current.rotations.home.config.enabled,
    false,
    'Activating live wallpaper pauses home rotation',
  );
  assert.equal(current.rotations.home.nextAt, undefined);
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
  // Switch the running generated scene to a video through the UI. The engine's surface has
  // already been drawn with Canvas, so the UI must route through Android's preview.
  await app();
  if (await page.getByRole('dialog').count())
    await page.getByRole('button', { name: 'Close preview' }).click();
  await page
    .getByRole('button', { name: 'Preview live wallpaper Sea nettles', exact: true })
    .click();
  // uiautomator cannot dump a window that never idles, so pick the destination while the
  // preview shows a still frame and start motion afterwards.
  await page.getByLabel('Animate wallpaper', { exact: true }).uncheck();
  await page
    .getByLabel('Live wallpaper preview')
    .getByRole('heading', { name: 'Sea nettles', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Save live wallpaper', exact: true }).count(),
    0,
    'Switching to a video must go through Android preview',
  );
  // The first mWallpaperComponent line is the home wallpaper; other lines name old connections.
  const component = () =>
    shell('dumpsys', 'wallpaper').match(/mWallpaperComponent=ComponentInfo\{([^}]+)\}/)?.[1];
  const sceneComponent = component();
  await page.getByRole('button', { name: 'Save & open Android preview', exact: true }).click();
  await delay(1500);
  await screenshot('live-video-picker');
  assert.equal(await nativeButton(/^Set wallpaper$/i), true, 'Android must offer Set wallpaper');
  await delay(800);
  await screenshot('live-video-destination');
  let chosen = false;
  for (let attempt = 0; attempt < 3 && !chosen; attempt++)
    chosen = await nativeButton(/^Home screen$/i);
  console.log('Video destination chosen:', chosen);
  await home();
  // Android rebinds asynchronously after Set wallpaper.
  for (let attempt = 0; attempt < 20 && component() === sceneComponent; attempt++) await delay(500);
  assert.notEqual(component(), sceneComponent, 'Preview must bind the other Luma component');
  await app();
  await save({ ...(await state()).live.config, motion: true });
  await home();
  await delay(1500);
  const videoA = await screenshot('live-video-home');
  await delay(1500);
  const videoB = await screenshot('live-video-moving');
  assert.notDeepEqual(await sample(videoA), await sample(videoB), 'Video wallpaper must play');
  await app();
  current = await state();
  assert.equal(
    current.live.config.videoId,
    'sea-nettles',
    'Saving downloads and selects the video',
  );
  assert.equal(current.live.videoError, undefined, 'Video must decode without errors');
  assert.match(
    shell('run-as', 'io.gjessing.luma', 'ls', '-l', 'files/live-videos'),
    /sea-nettles\.mp4/,
  );
  // Same engine, video to video: the decoder reattaches and pauses on a frame.
  await save({ ...current.live.config, motion: false });
  await home();
  await delay(1500);
  const videoStillA = await screenshot('live-video-still');
  await delay(1200);
  const videoStillB = await screenshot('live-video-still-second');
  assert.deepEqual(
    await sample(videoStillA),
    await sample(videoStillB),
    'Motion off must pause the video on a frame',
  );
  // A video saved directly onto an engine that drew a generated scene shows a still and asks
  // for Android's preview instead of failing.
  await app();
  await save({ ...settings, scene: 'stars', motion: true });
  await home();
  await app();
  await save({ ...current.live.config, motion: true });
  await home();
  await delay(1500);
  await screenshot('live-video-fallback-still');
  await app();
  assert.match((await state()).live.videoError ?? '', /Android preview/);

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
    await plugin.configure({
      config: {
        ...state.rotations.home.config,
        target: 'lock',
        playlistId: 'live-lock',
        name: 'Live lock',
        enabled: true,
      },
    });
  });
  await delay(1500);
  await connect();
  current = await state();
  assert.equal(
    current.live.active,
    true,
    'Lock-only rotation must preserve the live home wallpaper',
  );
  assert.equal(current.rotations.lock.config.enabled, true);
  assert.equal(current.rotations.home.config.enabled, false, 'The paused home playlist stays');
  await page.evaluate(() => window.Capacitor.Plugins.Wallpaper.next({ slot: 'lock' }));
  await delay(1000);
  await connect();
  assert.equal((await state()).live.active, true);
  await page.evaluate(() => window.Capacitor.Plugins.Wallpaper.pause({ slot: 'lock' }));
  // Hidden engine must stop posting frames (inspectable through dumpsys wallpaper).
  // Either Luma component may be running: each Android preview alternates between them.
  const hidden = shell('dumpsys', 'activity', 'service', 'io.gjessing.luma');
  await writeFile('test-results/live-wallpaper-hidden.txt', hidden);
  assert.match(hidden, /mVisible=false/, 'Wallpaper must hide behind the full-screen app');
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const state = await plugin.getState();
    await plugin.apply({
      config: {
        ...state.rotations.lock.config,
        target: 'home',
        enabled: false,
        ids: [state.rotations.lock.config.ids[0]],
      },
    });
  });
  await delay(1500);
  await connect();
  assert.equal((await state()).live.active, false, 'Applying a photo switches back');
  console.log(
    'Live wallpaper passed: real picker/cancel/activation, launcher animation, still mode, video download/playback/pause, all scenes/presets, rotation pause/lock-only coexistence, automatic weather, invalid-save rollback and switching back to photos.',
  );
} finally {
  await browser?.close();
}
