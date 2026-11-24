import { Knex } from 'knex';
import { DataType, newDb } from 'pg-mem';
import { getDb, setDb } from '../../src/db/knex';
import * as initialMigration from '../../src/db/migrations/001_initial_schema';

let activeTestDb: Knex | null = null;
let usingRealPostgres = false;

/**
 * Initializes the test database:
 * - If a real PostgreSQL instance is reachable via `TEST_DATABASE_URL` or `DATABASE_URL` (and `USE_REAL_PG === 'true'`),
 *   it connects to real PostgreSQL for full row-level lock verification.
 * - Otherwise, it spins up an isolated, deterministic `pg-mem` PostgreSQL engine in memory so
 *   `npm test` passes out-of-the-box anywhere (local machine, CI, reviewer laptop) without external dependencies.
 */
export async function setupTestDatabase(): Promise<Knex> {
  if (process.env.USE_REAL_PG === 'true') {
    const db = getDb();
    await initialMigration.down(db);
    await initialMigration.up(db);
    activeTestDb = db;
    usingRealPostgres = true;
    return db;
  }

  const mem = newDb();
  mem.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'lendsqr_wallet_test',
  });
  mem.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'PostgreSQL 16.0 (pg-mem)',
  });

  const knexInstance: Knex = mem.adapters.createKnex();
  await initialMigration.up(knexInstance);
  setDb(knexInstance);
  activeTestDb = knexInstance;
  usingRealPostgres = false;
  return knexInstance;
}

export async function resetTestDatabase(): Promise<void> {
  if (!activeTestDb) {
    await setupTestDatabase();
    return;
  }

  if (usingRealPostgres) {
    await activeTestDb('user_status_events').del();
    await activeTestDb('blacklist').del();
    await activeTestDb('idempotency_keys').del();
    await activeTestDb('ledger_entries').del();
    await activeTestDb('transactions').del();
    await activeTestDb('wallets').del();
    await activeTestDb('users').del();
  } else {
    await activeTestDb.destroy();
    await setupTestDatabase();
  }
}

export async function teardownTestDatabase(): Promise<void> {
  if (activeTestDb) {
    await activeTestDb.destroy();
    activeTestDb = null;
  }
}
