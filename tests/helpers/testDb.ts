import { Knex } from 'knex';
import { DataType, newDb } from 'pg-mem';
import { ensureDefaultAdminSeeded } from '../../src/db/cli';
import { getDb, setDb } from '../../src/db/knex';
import * as initialMigration from '../../src/db/migrations/001_initial_schema';

let activeTestDb: Knex | null = null;
let usingRealPostgres = false;

/**
 * In-memory pg-mem does not implement PostgreSQL's `SELECT ... FOR UPDATE` row lock wait queue.
 * To faithfully simulate PostgreSQL transaction serialization inside in-memory test runs
 * without polluting production service files, we wrap `knex.transaction()` in the test adapter
 * with a FIFO promise queue while real PostgreSQL uses native row-level locks.
 */
function attachInMemoryTransactionSerializer(knexInstance: Knex): void {
  const originalTransaction = knexInstance.transaction.bind(knexInstance);
  let tail: Promise<unknown> = Promise.resolve();

  Object.defineProperty(knexInstance, 'transaction', {
    configurable: true,
    writable: true,
    value: (
      callback?: (trx: Knex.Transaction) => Promise<unknown>,
      config?: Knex.TransactionConfig,
    ) => {
      if (typeof callback !== 'function') {
        return originalTransaction(callback, config);
      }

      const next = tail.then(
        () => originalTransaction(callback, config),
        () => originalTransaction(callback, config),
      );
      tail = next.catch(() => undefined);
      return next;
    },
  });
}

export async function setupTestDatabase(): Promise<Knex> {
  if (process.env.USE_REAL_PG === 'true') {
    const db = getDb();
    await initialMigration.down(db);
    await initialMigration.up(db);
    await ensureDefaultAdminSeeded();
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
  attachInMemoryTransactionSerializer(knexInstance);
  await initialMigration.up(knexInstance);
  setDb(knexInstance);
  await ensureDefaultAdminSeeded();
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
    await activeTestDb('blacklist').del();
    await activeTestDb('idempotency_keys').del();
    await activeTestDb('ledger_entries').del();
    await activeTestDb('transactions').del();
    await activeTestDb('wallets').del();
    await activeTestDb('users').del();
    await ensureDefaultAdminSeeded();
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
