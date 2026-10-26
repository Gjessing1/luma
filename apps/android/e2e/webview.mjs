import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP(process.env.LUMA_CDP_URL ?? 'http://127.0.0.1:9228', {
  noDefaults: true,
});
let page;
async function reconnect() {
  // Android's dynamic-color overlay can replace the whole WebView after setBitmap.
  await new Promise((resolve) => setTimeout(resolve, 1800));
  page = browser
    .contexts()[0]
    .pages()
    .find((candidate) => candidate.url().startsWith('http://10.0.2.2:3048'));
  assert.ok(page, 'Expected the replacement test WebView');
  page.setDefaultTimeout(20000);
  await page.locator('main').waitFor();
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
try {
  await reconnect();
  assert.equal(new URL(page.url()).hostname, '10.0.2.2', 'Never run this against production');
  await page.reload();
  await page.locator('main').waitFor();
  if (await page.getByRole('dialog').count())
    await page.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Emerald tide', exact: true }).waitFor();
  for (const name of ['Emerald tide', 'Blue hour']) {
    const add = page.getByRole('button', { name: `Add to playlist: ${name}`, exact: true });
    if (await add.count()) await add.click();
  }
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByLabel('Galaxy profile').selectOption('s25');
  await page.getByLabel('Change wallpaper').selectOption('interval');
  await page.getByLabel('Every').selectOption('15');
  await action(() => page.getByRole('button', { name: 'Save & start rotation' }).click());
  let current = await state();
  assert.equal(current.config.ids.length, 2);
  assert.equal(current.config.device, 's25');
  assert.equal(current.config.enabled, true);
  assert.ok(current.nextAt > Date.now());
  assert.equal(await page.getByRole('button', { name: 'Schedule', exact: true }).count(), 1);
  const initial = current.lastId;
  await action(() => page.evaluate(() => window.Capacitor.Plugins.Wallpaper.next()));
  current = await state();
  assert.notEqual(current.lastId, initial);
  const failed = await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const before = await plugin.getState();
    try {
      await plugin.configure({
        config: { ...before.config, ids: ['00000000-0000-0000-0000-000000000000'] },
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(failed, true);
  assert.deepEqual((await state()).config, current.config);
  await page.evaluate(async () => {
    const plugin = window.Capacitor.Plugins.Wallpaper;
    const current = await plugin.getState();
    await plugin.exportImage({ id: current.config.ids[0], config: current.config });
  });
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByText('Paused', { exact: true }).waitFor();
  current = await state();
  assert.equal(current.config.enabled, false);
  assert.equal(current.nextAt, undefined);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/android-schedule.png' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Emerald tide', exact: true }).click();
  await page.getByRole('button', { name: 'AMOLED night', exact: true }).click();
  await action(() =>
    page.getByRole('button', { name: 'Apply to home & lock screen', exact: true }).click(),
  );
  current = await state();
  assert.equal(current.config.enabled, false);
  assert.ok(current.lastApplied);
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: 'test-results/android-preview.png' });
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByText('Paused', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Galaxy profile').inputValue(), 's25');
  console.log(
    'Android WebView passed: native sync/apply/next, failed-sync rollback, Gallery export, pause and state restored after wallpaper-triggered Activity recreation.',
  );
} finally {
  await browser.close();
}
