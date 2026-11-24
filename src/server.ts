import { app } from './app';
import { APP_CONSTANTS, env } from './config/env';
import { runMigrations } from './db/cli';
import { getDb } from './db/knex';

async function bootstrap(): Promise<void> {
  try {
    await runMigrations();
    console.log('[DB] PostgreSQL schema migrations verified.');
  } catch (err) {
    console.error('[DB] Failed to run startup migrations:', err);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(
      `[${APP_CONSTANTS.SERVICE_NAME}] Server listening on port ${env.PORT} (${env.NODE_ENV})`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[${APP_CONSTANTS.SERVICE_NAME}] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await getDb().destroy();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
