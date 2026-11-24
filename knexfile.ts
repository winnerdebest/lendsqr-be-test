import type { Knex } from 'knex';
import { knexConfig } from './src/db/knex';

const config: { [key: string]: Knex.Config } = {
  development: knexConfig,
  test: knexConfig,
  production: knexConfig,
};

export default config;
