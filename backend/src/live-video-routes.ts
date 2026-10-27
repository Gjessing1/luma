import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { isLiveVideoId, parseLiveVideo, type LiveVideo } from '@luma/core/live-wallpaper';

export function registerLiveVideoRoutes(app: FastifyInstance, dataDir: string): void {
  const directory = join(dataDir, 'live-wallpapers');
  async function catalog(): Promise<LiveVideo[]> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    if (!Array.isArray(raw)) throw new Error('Invalid live wallpaper catalog');
    return raw.map(parseLiveVideo);
  }
  let writes = Promise.resolve();
  // Serialized like the photo library so overlapping deletes cannot resurrect an entry.
  function removeVideo(id: string): Promise<boolean> {
    const result = writes.then(async function remove() {
      const videos = await catalog();
      const remaining = videos.filter((entry) => entry.id !== id);
      if (remaining.length === videos.length) return false;
      const temporary = join(directory, '.catalog.tmp');
      await writeFile(temporary, JSON.stringify(remaining, null, 2) + '\n');
      await rename(temporary, join(directory, 'catalog.json'));
      // Unlist first: a crash between the two steps leaves an orphaned folder, never a broken entry.
      await rm(join(directory, id), { recursive: true, force: true });
      return true;
    });
    writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  app.get('/api/live-wallpapers', async function listVideos(_request, reply) {
    reply.header('Cache-Control', 'no-cache');
    return catalog();
  });
  app.get<{ Params: { id: string; file: string } }>(
    '/api/live-wallpapers/:id/:file',
    async function videoFile(request, reply) {
      const { id, file } = request.params;
      const video = (await catalog()).find((entry) => entry.id === id);
      if (!video || !['wallpaper.mp4', 'poster.jpg'].includes(file))
        return reply.code(404).send({ error: 'Wallpaper not found' });
      try {
        await stat(join(directory, id, file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return reply.code(404).send({ error: 'Wallpaper file is unavailable' });
      }
      // sendFile handles byte ranges and HEAD for browser seeking and native downloads.
      return reply.header('Cache-Control', 'no-cache').sendFile(`${id}/${file}`, directory);
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/api/live-wallpapers/:id',
    async function deleteVideo(request, reply) {
      if (!isLiveVideoId(request.params.id) || !(await removeVideo(request.params.id)))
        return reply.code(404).send({ error: 'Wallpaper not found' });
      return { ok: true };
    },
  );
}
