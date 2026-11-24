import knex, { Knex } from 'knex';
import path from 'path';
import { env } from '../config/env';

const needsSsl =
  env.NODE_ENV === 'production' ||
  env.DATABASE_URL.includes('render.com') ||
  env.DATABASE_URL.includes('ssl=true') ||
  env.DATABASE_URL.includes('sslmode=require');

export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: needsSsl
    ? {
        connectionString: env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : env.DATABASE_URL,
  pool: {
    min: 2,
    max: 15,
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: path.resolve(__dirname, 'migrations'),
    loadExtensions: ['.ts', '.js'],
  },
};

let dbInstance: Knex = knex(knexConfig);

export function getDb(): Knex {
  return dbInstance;
}

/**
 * Allows tests to swap or rebind the active Knex instance (e.g. test DB or isolated schema).
 */
export function setDb(instance: Knex): void {
  dbInstance = instance;
}

export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await dbInstance.raw('SELECT 1');
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      connected: false,
      latencyMs: Date.now() - start,
    };
  }
}
