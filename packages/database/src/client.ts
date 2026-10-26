import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { projects } from './schema/index.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  return {
    db,
    projects: {
      async list() {
        return db.select().from(projects).orderBy(projects.name);
      },
      async create(input: { name: string; repositoryPath: string }) {
        const [project] = await db.insert(projects).values(input).returning();
        if (!project) throw new Error('Project insert returned no record');
        return project;
      },
    },
    async checkConnection(): Promise<void> {
      await pool.query('select 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
