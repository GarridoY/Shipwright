import { afterEach, describe, expect, it } from 'vitest';
import { buildApi } from './app.js';

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /health', () => {
  it('reports API and database readiness', async () => {
    const app = await buildApi({ checkDatabase: async () => undefined });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'shipwright-api',
      database: 'connected',
    });
  });

  it('returns unavailable without exposing database errors', async () => {
    const app = await buildApi({
      checkDatabase: async () => {
        throw new Error('sensitive connection detail');
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      service: 'shipwright-api',
      database: 'disconnected',
    });
    expect(response.body).not.toContain('sensitive connection detail');
  });
});
