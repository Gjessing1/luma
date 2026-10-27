import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Wallpaper } from '@luma/core/wallpaper';

describe('wallpaper library', () => {
  let directory: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'luma-test-'));
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
  async function upload() {
    const image = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#e08040' },
    })
      .png()
      .toBuffer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallpapers',
      headers: { 'content-type': 'image/png', 'x-file-name': 'Landscape.png' },
      payload: image,
    });
    expect(res.statusCode).toBe(201);
    return res.json<Wallpaper>();
  }
  it('persists concurrent uploads, edits favorites, renders both sizes, and deletes safely', async () => {
    const rows = await Promise.all([upload(), upload(), upload()]);
    expect((await app.inject('/api/wallpapers')).json()).toHaveLength(3);
    const row = rows[0]!;
    expect(row.name).toBe('Landscape');
    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/wallpapers/${row.id}`,
      payload: { name: 'Sunrise', favorite: true },
    });
    expect(edit.json()).toMatchObject({ name: 'Sunrise', favorite: true });
    for (const [device, width, height] of [
      ['s24-ultra', 1440, 3120],
      ['s25', 1080, 2340],
    ] as const) {
      const render = await app.inject(
        `/api/wallpapers/${row.id}/image?device=${device}&dim=35&blur=20&warmth=15&grayscale=1`,
      );
      expect(render.statusCode).toBe(200);
      expect(await sharp(render.rawPayload).metadata()).toMatchObject({
        width,
        height,
        format: 'jpeg',
      });
    }
    expect((await app.inject(`/api/wallpapers/${row.id}/image?device=__proto__`)).statusCode).toBe(
      400,
    );
    expect((await app.inject(`/api/wallpapers/${row.id}/image?dim=NaN`)).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/wallpapers/${row.id}`,
          payload: { favorite: 'yes' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/wallpapers/${row.id}` })).statusCode,
    ).toBe(200);
    expect((await app.inject(`/api/wallpapers/${row.id}/image`)).statusCode).toBe(404);
    const restarted = await buildApp({
      ...loadConfig({ LOG_LEVEL: 'silent' }),
      dataDir: directory,
      webRoot: '/nonexistent',
    });
    expect((await restarted.inject('/api/wallpapers')).json()).toHaveLength(2);
    await restarted.close();
  });
  it('zooms a screen-shaped photo so it can be moved, and serves the whole photo for previews', async () => {
    // Left half black, right half white, already exactly the S24 Ultra's shape.
    const image = await sharp({
      create: { width: 1440, height: 3120, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: { create: { width: 720, height: 3120, channels: 3, background: '#000000' } },
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const row = (
      await app.inject({
        method: 'POST',
        url: '/api/wallpapers',
        headers: { 'content-type': 'image/png' },
        payload: image,
      })
    ).json<Wallpaper>();
    async function brightness(query: string) {
      const render = await app.inject(`/api/wallpapers/${row.id}/image?${query}`);
      expect(render.statusCode).toBe(200);
      const { channels } = await sharp(render.rawPayload).stats();
      return channels[0]!.mean;
    }
    expect(await brightness('x=0')).toBeCloseTo(await brightness('x=100'), 0);
    expect(await brightness('zoom=200&x=0')).toBeLessThan(5);
    expect(await brightness('zoom=200&x=100')).toBeGreaterThan(250);
    for (const zoom of ['99', '301', 'NaN'])
      expect((await app.inject(`/api/wallpapers/${row.id}/image?zoom=${zoom}`)).statusCode).toBe(
        400,
      );
    const source = await app.inject(`/api/wallpapers/${row.id}/source`);
    expect(await sharp(source.rawPayload).metadata()).toMatchObject({
      width: 738,
      height: 1600,
      format: 'jpeg',
    });
    expect(
      (await app.inject('/api/wallpapers/a5bc359c-c9b0-4c2b-9515-2ba59841db77/source')).statusCode,
    ).toBe(404);
  });
  it('keeps photo provenance through uploads and rejects unsafe source links', async () => {
    const image = await sharp({
      create: { width: 60, height: 130, channels: 3, background: '#24384c' },
    })
      .png()
      .toBuffer();
    const source = {
      url: 'https://www.nasa.gov/example-photo/',
      author: 'NASA',
      license: 'NASA image download',
    };
    const result = await app.inject({
      method: 'POST',
      url: '/api/wallpapers',
      headers: {
        'content-type': 'image/png',
        'x-wallpaper-source': encodeURIComponent(JSON.stringify(source)),
      },
      payload: image,
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().source).toEqual(source);
    expect((await app.inject('/api/wallpapers')).json()[0].source).toEqual(source);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/wallpapers',
      headers: {
        'content-type': 'image/png',
        'x-wallpaper-source': encodeURIComponent(
          JSON.stringify({ ...source, url: 'javascript:alert(1)' }),
        ),
      },
      payload: image,
    });
    expect(invalid.statusCode).toBe(400);
    expect((await app.inject('/api/wallpapers')).json()).toHaveLength(1);
  });
  it('rejects disguised and oversized uploads', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallpapers',
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from('<script>alert(1)</script>'),
    });
    expect(res.statusCode).toBe(400);
    const large = await app.inject({
      method: 'POST',
      url: '/api/wallpapers',
      headers: { 'content-type': 'image/png' },
      payload: Buffer.alloc(25 * 1024 * 1024 + 1),
    });
    expect(large.statusCode).toBe(413);
    expect((await app.inject('/api/wallpapers')).json()).toEqual([]);
  });
});
