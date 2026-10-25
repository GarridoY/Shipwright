import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { HealthResponse } from '@shipwright/contracts';

export interface ApiDependencies {
  checkDatabase(): Promise<void>;
}

export async function buildApi(dependencies: ApiDependencies) {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  });

  app.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    try {
      await dependencies.checkDatabase();
      return { status: 'ok', service: 'shipwright-api', database: 'connected' };
    } catch {
      reply.code(503);
      return { status: 'error', service: 'shipwright-api', database: 'disconnected' };
    }
  });

  return app;
}
