import { getDb } from './knex';
import * as initialMigration from './migrations/001_initial_schema';

export async function runMigrations(): Promise<void> {
  const db = getDb();
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    await initialMigration.up(db);
  }
}

export async function rollbackMigrations(): Promise<void> {
  const db = getDb();
  await initialMigration.down(db);
}

async function main(): Promise<void> {
  const action = process.argv[2] || 'latest';
  const db = getDb();
  try {
    if (action === 'rollback') {
      await rollbackMigrations();
      console.log('[DB] Rolled back initial schema migration.');
    } else {
      await runMigrations();
      console.log('[DB] Applied initial schema migration.');
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[DB Migration Error]', err);
    process.exit(1);
  });
}
