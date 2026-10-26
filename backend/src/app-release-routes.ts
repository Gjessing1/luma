import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseAppRelease, type AppRelease } from '@luma/core/app-release';

// The published Android APK (A7). scripts/release-android.sh writes the APK and version.json into
// LUMA_DATA_DIR/app (A6), so a redeploy never loses the release.
async function readPublished(appDir: string): Promise<AppRelease & { bytes: number }> {
  const release = parseAppRelease(JSON.parse(await readFile(join(appDir, 'version.json'), 'utf8')));
  const file = await stat(join(appDir, release.file));
  if (!file.isFile()) {
    throw new Error('The published APK is not a file');
  }
  return { ...release, bytes: file.size };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function registerAppReleaseRoutes(app: FastifyInstance, dataDir: string): void {
  const appDir = join(dataDir, 'app');

  app.get('/api/app/version', async function appVersion(request, reply) {
    try {
      const release = await readPublished(appDir);
      reply.header('Cache-Control', 'no-cache');
      return {
        versionCode: release.versionCode,
        versionName: release.versionName,
        sha256: release.sha256,
        bytes: release.bytes,
        apkUrl: '/api/app/download',
      };
    } catch (error) {
      if (!isMissing(error)) {
        request.log.error({ err: error }, 'Published Android app is unreadable');
      }
      return reply.code(404).send({ error: 'No Android app has been published' });
    }
  });

  app.get('/api/app/download', async function appDownload(request, reply) {
    try {
      const release = await readPublished(appDir);
      return reply
        .type('application/vnd.android.package-archive')
        .header('Cache-Control', 'no-cache')
        .header('Content-Length', release.bytes)
        .header('Content-Disposition', `attachment; filename="${release.file}"`)
        .send(createReadStream(join(appDir, release.file)));
    } catch (error) {
      if (!isMissing(error)) {
        request.log.error({ err: error }, 'Published Android app is unreadable');
      }
      return reply.code(404).send({ error: 'No Android app has been published' });
    }
  });
}
