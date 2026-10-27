import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { HealthReport } from '@luma/core';
import { registerAppReleaseRoutes } from './app-release-routes.js';
import { registerWallpaperRoutes } from './wallpaper-routes.js';
import { registerLiveVideoRoutes } from './live-video-routes.js';
import type { Config } from './config.js';

export async function buildApp(config: Config) {
  const app = Fastify({ logger: { level: config.logLevel } });
  await app.register(fastifyStatic, { root: config.webRoot, serve: existsSync(config.webRoot) });

  app.get('/api/health', async function health(): Promise<HealthReport> {
    return { ok: true, name: 'luma', version: config.version, gitSha: config.gitSha };
  });
  registerAppReleaseRoutes(app, config.dataDir);
  registerWallpaperRoutes(app, config.dataDir);
  registerLiveVideoRoutes(app, config.dataDir);

  if (existsSync(config.webRoot)) {
    // SPA fallback: unknown non-API paths get index.html so client routing works.
    app.setNotFoundHandler(function spaFallback(request, reply) {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
