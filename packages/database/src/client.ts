import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    db: drizzle(pool),
    async checkConnection(): Promise<void> {
      await pool.query('select 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
