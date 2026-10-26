// All configuration comes from env vars, read once at startup. Secrets never
// leave the backend.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  gitSha: string;
  version: string;
  // Built web app, served same-origin. Absent in dev (Vite serves the UI).
  webRoot: string;
}

function readVersion(): string {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
  return pkg.version;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3048);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got ${env.PORT}`);
  }
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.LUMA_DATA_DIR ?? './data'),
    logLevel: env.LOG_LEVEL ?? 'info',
    gitSha: env.GIT_SHA ?? '',
    version: readVersion(),
    webRoot: resolve(env.LUMA_WEB_ROOT ?? new URL('../public', import.meta.url).pathname),
  };
}
