import { createDatabase } from '@shipwright/database';
import { buildApi } from './app.js';
import { resolveApiHost } from './config.js';

const host = resolveApiHost(process.env.API_HOST);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set');

const port = Number(process.env.API_PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('API_PORT must be a valid TCP port');

const database = createDatabase(databaseUrl);
const app = await buildApi({ checkDatabase: database.checkConnection });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await database.close();
    process.exit(0);
  });
}

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await database.close();
  process.exitCode = 1;
}
