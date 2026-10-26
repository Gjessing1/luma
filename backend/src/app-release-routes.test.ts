import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function appWith(dir: string) {
  return buildApp({
    ...loadConfig({ LOG_LEVEL: 'silent' }),
    dataDir: dir,
    webRoot: '/nonexistent',
  });
}

describe('Android release API', () => {
  it('answers 404 until an APK is published', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luma-app-release-'));
    const app = await appWith(dir);
    try {
      expect((await app.inject({ url: '/api/app/version' })).statusCode).toBe(404);
      expect((await app.inject({ url: '/api/app/download' })).statusCode).toBe(404);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serves the published version and the APK it names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luma-app-release-'));
    const apk = Buffer.from('not really an apk');
    const sha256 = createHash('sha256').update(apk).digest('hex');
    await mkdir(join(dir, 'app'));
    await writeFile(join(dir, 'app', 'luma-0.2.0.apk'), apk);
    await writeFile(
      join(dir, 'app', 'version.json'),
      JSON.stringify({ versionCode: 2, versionName: '0.2.0', file: 'luma-0.2.0.apk', sha256 }),
    );
    const app = await appWith(dir);
    try {
      const version = await app.inject({ url: '/api/app/version' });
      expect(version.json()).toEqual({
        versionCode: 2,
        versionName: '0.2.0',
        sha256,
        bytes: apk.length,
        apkUrl: '/api/app/download',
      });
      const download = await app.inject({ url: '/api/app/download' });
      expect(download.statusCode).toBe(200);
      expect(download.headers['content-type']).toBe('application/vnd.android.package-archive');
      expect(download.headers['content-disposition']).toBe('attachment; filename="luma-0.2.0.apk"');
      expect(download.rawPayload.equals(apk)).toBe(true);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
