import { join } from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import {
  cropRectangle,
  devices,
  isWallpaperId,
  parseWallpaperSource,
  type Device,
} from '@luma/core/wallpaper';
import { starterWallpapers } from './starter-wallpapers.js';
import { Library } from './library.js';

export function registerWallpaperRoutes(app: FastifyInstance, dataDir: string) {
  const library = new Library(join(dataDir, 'wallpapers'));
  app.addContentTypeParser(
    /^image\/(jpeg|png|webp|avif|heic|heif)$/,
    { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  app.get('/api/wallpapers', async () => library.list());
  app.post('/api/wallpapers/starter', async (_request, reply) => {
    const rows = [];
    for (const wallpaper of starterWallpapers())
      rows.push(await library.add(wallpaper.data, wallpaper.name));
    return reply.code(201).send(rows);
  });
  app.post('/api/wallpapers', async (request, reply) => {
    if (!Buffer.isBuffer(request.body))
      return reply.code(415).send({ error: 'Upload a JPEG, PNG, WebP or AVIF image' });
    try {
      const name =
        typeof request.headers['x-file-name'] === 'string'
          ? decodeURIComponent(request.headers['x-file-name'])
          : 'Wallpaper';
      const sourceHeader = request.headers['x-wallpaper-source'];
      const source = parseWallpaperSource(
        typeof sourceHeader === 'string' ? JSON.parse(decodeURIComponent(sourceHeader)) : undefined,
      );
      return reply
        .code(201)
        .send(await library.add(request.body, name.replace(/\.[^.]+$/, ''), source));
    } catch {
      return reply.code(400).send({
        error:
          'Could not read this image. Use JPEG, PNG, WebP or AVIF under 25 MB and 50 megapixels.',
      });
    }
  });
  app.patch<{ Params: { id: string }; Body: { name?: unknown; favorite?: unknown } }>(
    '/api/wallpapers/:id',
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object')
        return reply.code(400).send({ error: 'Invalid changes' });
      const changes: { name?: string; favorite?: boolean } = {};
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120)
          return reply.code(400).send({ error: 'Name must be 1–120 characters' });
        changes.name = body.name.trim();
      }
      if (body.favorite !== undefined) {
        if (typeof body.favorite !== 'boolean')
          return reply.code(400).send({ error: 'Invalid favorite' });
        changes.favorite = body.favorite;
      }
      const row = await library.update(request.params.id, changes);
      return row ?? reply.code(404).send({ error: 'Wallpaper not found' });
    },
  );
  app.delete<{ Params: { id: string } }>('/api/wallpapers/:id', async (request, reply) => {
    if (!isWallpaperId(request.params.id))
      return reply.code(404).send({ error: 'Wallpaper not found' });
    return (await library.remove(request.params.id))
      ? { ok: true }
      : reply.code(404).send({ error: 'Wallpaper not found' });
  });
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/wallpapers/:id/image',
    async (request, reply) => {
      const { id } = request.params;
      if (!isWallpaperId(id)) return reply.code(404).send({ error: 'Wallpaper not found' });
      const q = request.query;
      const device = q.device ?? 's24-ultra';
      if (!Object.hasOwn(devices, device)) return reply.code(400).send({ error: 'Unknown device' });
      function value(key: string, fallback: number) {
        const n = Number(q[key] ?? fallback);
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Invalid effect');
        return n;
      }
      const row = (await library.list()).find((item) => item.id === id);
      if (!row) return reply.code(404).send({ error: 'Wallpaper not found' });
      try {
        const profile = devices[device as Device];
        const dim = value('dim', 0),
          blur = value('blur', 0),
          warmth = value('warmth', 0);
        let image = sharp(library.file(id))
          .extract(
            cropRectangle(row.width, row.height, device as Device, value('x', 50), value('y', 50)),
          )
          .resize(q.thumb === '1' ? 360 : profile.width, q.thumb === '1' ? 780 : profile.height);
        if (q.grayscale === '1') image = image.grayscale();
        if (blur > 0)
          image = image.blur(
            Math.max(0.3, ((blur / 5) * (q.thumb === '1' ? 360 : profile.width)) / 1440),
          );
        if (warmth > 0)
          image = image.recomb([
            [1 + warmth / 500, 0, 0],
            [0, 1, 0],
            [0, 0, 1 - warmth / 250],
          ]);
        if (dim > 0) image = image.modulate({ brightness: 1 - dim / 100 });
        reply.type('image/jpeg').header('Cache-Control', 'private, max-age=86400');
        return await image.jpeg({ quality: q.thumb === '1' ? 78 : 93 }).toBuffer();
      } catch {
        return reply.code(400).send({ error: 'Could not render wallpaper' });
      }
    },
  );
}
