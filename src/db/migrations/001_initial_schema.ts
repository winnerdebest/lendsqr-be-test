import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('phone', 32).notNullable().unique();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('password_hash', 255).notNullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('active')
      .checkIn(['active', 'blocked'], 'chk_users_status');
    table.string('blocked_reason', 500).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'idx_users_status');
  });

  // 2. wallets table
  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.string('account_number', 10).notNullable().unique();
    table.string('currency', 3).notNullable().defaultTo('NGN');
    table.bigInteger('balance').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    'ALTER TABLE wallets ADD CONSTRAINT chk_wallets_balance_non_negative CHECK (balance >= 0)',
  );

  // 3. transactions table
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary();
    table.string('reference', 64).notNullable().unique();
    table.string('provider_reference', 128).nullable().unique();
    table
      .string('type', 20)
      .notNullable()
      .checkIn(['funding', 'transfer'], 'chk_transactions_type');
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'successful', 'failed'], 'chk_transactions_status');
    table
      .uuid('source_wallet_id')
      .nullable()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');
    table
      .uuid('destination_wallet_id')
      .nullable()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');
    table.bigInteger('amount').notNullable();
    table.string('currency', 3).notNullable().defaultTo('NGN');
    table.string('narration', 500).nullable();
    table.string('failure_reason', 500).nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['source_wallet_id', 'created_at'], 'idx_transactions_source_wallet');
    table.index(['destination_wallet_id', 'created_at'], 'idx_transactions_dest_wallet');
    table.index(['type', 'status'], 'idx_transactions_type_status');
  });

  await knex.raw(
    'ALTER TABLE transactions ADD CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0)',
  );
  await knex.raw(
    'ALTER TABLE transactions ADD CONSTRAINT chk_transactions_no_self_transfer CHECK (source_wallet_id IS NULL OR destination_wallet_id IS NULL OR source_wallet_id <> destination_wallet_id)',
  );

  // 4. ledger_entries table (double-entry ledger)
  await knex.schema.createTable('ledger_entries', (table) => {
    table.uuid('id').primary();
    table
      .uuid('transaction_id')
      .notNullable()
      .references('id')
      .inTable('transactions')
      .onDelete('RESTRICT');
    table
      .uuid('wallet_id')
      .notNullable()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');
    table
      .string('direction', 10)
      .notNullable()
      .checkIn(['debit', 'credit'], 'chk_ledger_entries_direction');
    table.bigInteger('amount').notNullable();
    table.bigInteger('balance_before').notNullable();
    table.bigInteger('balance_after').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['wallet_id', 'created_at'], 'idx_ledger_entries_wallet');
    table.index(['transaction_id'], 'idx_ledger_entries_transaction');
  });

  await knex.raw(
    'ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_entries_amount_positive CHECK (amount > 0)',
  );

  // 5. idempotency_keys table
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('key', 128).notNullable();
    table.string('endpoint', 128).notNullable();
    table.string('request_hash', 64).notNullable();
    table
      .string('state', 20)
      .notNullable()
      .defaultTo('in_progress')
      .checkIn(['in_progress', 'completed'], 'chk_idempotency_keys_state');
    table.integer('response_status').nullable();
    table.jsonb('response_body').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();

    table.unique(['user_id', 'key'], { indexName: 'uq_idempotency_user_key' });
    table.index(['expires_at'], 'idx_idempotency_expires_at');
  });

  // 6. blacklist table
  await knex.schema.createTable('blacklist', (table) => {
    table.uuid('id').primary();
    table.string('identity', 255).notNullable().unique();
    table.string('reason', 500).notNullable();
    table
      .string('source', 20)
      .notNullable()
      .defaultTo('local')
      .checkIn(['local', 'karma'], 'chk_blacklist_source');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('blacklist');
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('ledger_entries');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('wallets');
  await knex.schema.dropTableIfExists('users');
}
