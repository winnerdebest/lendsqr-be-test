import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { APP_CONSTANTS } from '../config/env';
import { UserRecord, WalletRecord } from '../common/types/entities';
import { generateAccountNumber } from '../common/utils/money';
import { getDb } from './knex';
import * as initialMigration from './migrations/001_initial_schema';

export async function ensureDefaultAdminSeeded(): Promise<void> {
  const db = getDb();
  const existingAdmin = await db<UserRecord>('users')
    .where('email', APP_CONSTANTS.DEFAULT_ADMIN_EMAIL)
    .first();

  if (existingAdmin) {
    if (existingAdmin.role !== 'admin') {
      await db<UserRecord>('users')
        .where('id', existingAdmin.id)
        .update({ role: 'admin', updated_at: new Date() });
    }
    return;
  }

  const now = new Date();
  const adminId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(APP_CONSTANTS.DEFAULT_ADMIN_PASSWORD, 10);

  await db.transaction(async (trx) => {
    await trx<UserRecord>('users').insert({
      id: adminId,
      email: APP_CONSTANTS.DEFAULT_ADMIN_EMAIL,
      phone: APP_CONSTANTS.DEFAULT_ADMIN_PHONE,
      first_name: 'Lendsqr',
      last_name: 'Admin',
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
      blocked_reason: null,
      created_at: now,
      updated_at: now,
    });

    await trx<WalletRecord>('wallets').insert({
      id: crypto.randomUUID(),
      user_id: adminId,
      account_number: generateAccountNumber(),
      currency: 'NGN',
      balance: 0,
      created_at: now,
      updated_at: now,
    });
  });
}

export async function runMigrations(): Promise<void> {
  const db = getDb();
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    await initialMigration.up(db);
  } else {
    const hasRoleColumn = await db.schema.hasColumn('users', 'role');
    if (!hasRoleColumn) {
      await db.schema.alterTable('users', (table) => {
        table.string('role', 20).notNullable().defaultTo('user');
      });
    }
  }
  await ensureDefaultAdminSeeded();
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
      console.log('[DB] Applied initial schema migration and verified default admin user.');
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
