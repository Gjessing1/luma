import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

describe('GET /api/health', () => {
  it('reports the build it runs', async () => {
    const config = loadConfig({ GIT_SHA: 'abc123', LOG_LEVEL: 'silent' });
    const app = await buildApp({ ...config, webRoot: '/nonexistent' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, name: 'luma', gitSha: 'abc123' });
    await app.close();
  });
});
