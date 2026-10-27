import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

describe('curated live wallpapers', () => {
  let directory: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'luma-video-test-'));
    app = await buildApp({
      ...loadConfig({ LOG_LEVEL: 'silent' }),
      dataDir: directory,
      webRoot: '/nonexistent',
    });
  });
  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  it('discovers newly published videos with credits and serves ranges without exposing other files', async () => {
    expect((await app.inject('/api/live-wallpapers')).json()).toEqual([]);
    const root = join(directory, 'live-wallpapers');
    await mkdir(join(root, 'test-video'), { recursive: true });
    const video = {
      id: 'test-video',
      name: 'Test',
      description: 'A test clip',
      width: 1080,
      height: 2340,
      duration: 19,
      bytes: 10,
      sha256: 'a'.repeat(64),
      changes: 'Cropped and muted.',
      source: { url: 'https://example.com/source', author: 'Author', license: 'CC0' },
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    };
    await writeFile(join(root, 'catalog.json'), JSON.stringify([video]));
    await writeFile(join(root, 'test-video', 'wallpaper.mp4'), '0123456789');
    await writeFile(join(root, 'test-video', 'poster.jpg'), 'poster');
    await writeFile(join(root, 'test-video', 'private.txt'), 'not for serving');
    expect((await app.inject('/api/live-wallpapers')).json()).toEqual([video]);
    const range = await app.inject({
      url: '/api/live-wallpapers/test-video/wallpaper.mp4',
      headers: { range: 'bytes=2-5' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-type']).toBe('video/mp4');
    expect(range.headers['content-range']).toBe('bytes 2-5/10');
    expect(range.body).toBe('2345');
    expect(
      (await app.inject({ method: 'HEAD', url: '/api/live-wallpapers/test-video/wallpaper.mp4' }))
        .headers['content-length'],
    ).toBe('10');
    expect((await app.inject('/api/live-wallpapers/test-video/private.txt')).statusCode).toBe(404);
    expect((await app.inject('/api/live-wallpapers/unlisted/wallpaper.mp4')).statusCode).toBe(404);
    await rm(join(root, 'test-video', 'poster.jpg'));
    expect((await app.inject('/api/live-wallpapers/test-video/poster.jpg')).statusCode).toBe(404);
  });
  it('deletes a curated video and its files, leaving the others listed', async () => {
    const root = join(directory, 'live-wallpapers');
    const videos = ['first', 'second'].map((id) => ({
      id,
      name: id,
      description: 'A test clip',
      width: 1080,
      height: 2340,
      duration: 19,
      bytes: 10,
      sha256: 'a'.repeat(64),
      changes: 'Cropped and muted.',
      source: { url: 'https://example.com/source', author: 'Author', license: 'CC0' },
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    }));
    for (const video of videos) {
      await mkdir(join(root, video.id), { recursive: true });
      await writeFile(join(root, video.id, 'wallpaper.mp4'), '0123456789');
    }
    await writeFile(join(root, 'catalog.json'), JSON.stringify(videos));
    const [deleted, repeated] = await Promise.all([
      app.inject({ method: 'DELETE', url: '/api/live-wallpapers/first' }),
      app.inject({ method: 'DELETE', url: '/api/live-wallpapers/first' }),
    ]);
    expect([deleted.statusCode, repeated.statusCode].sort()).toEqual([200, 404]);
    expect((await app.inject('/api/live-wallpapers')).json()).toEqual([videos[1]]);
    expect((await app.inject('/api/live-wallpapers/first/wallpaper.mp4')).statusCode).toBe(404);
    await expect(stat(join(root, 'first'))).rejects.toThrow();
    for (const id of ['..', 'catalog.json', 'missing'])
      expect(
        (await app.inject({ method: 'DELETE', url: `/api/live-wallpapers/${id}` })).statusCode,
      ).toBe(404);
    expect((await app.inject('/api/live-wallpapers')).json()).toEqual([videos[1]]);
  });
  it('rejects a catalog entry that could escape the media directory', async () => {
    const root = join(directory, 'live-wallpapers');
    await mkdir(root);
    await writeFile(join(root, 'catalog.json'), JSON.stringify([{ id: '../secret' }]));
    expect((await app.inject('/api/live-wallpapers')).statusCode).toBe(500);
  });
});
