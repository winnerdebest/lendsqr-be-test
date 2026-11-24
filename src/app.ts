import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { sendSuccess } from './common/utils/response';
import { APP_CONSTANTS, env } from './config/env';
import { checkDbHealth } from './db/knex';
import { renderLandingPageHtml, renderSwaggerDocsHtml } from './docs/landing';
import { openApiSpec } from './docs/openapi';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter, usersRouter } from './modules/auth/auth.routes';
import { transactionsRouter } from './modules/transactions/transactions.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';
import { walletsRouter, webhooksRouter } from './modules/wallets/wallets.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers (relaxed CSP on /docs so Swagger UI CDN assets load cleanly)
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors());

  // Capture rawBody buffer for HMAC-SHA512 Paystack webhook verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Rate limit auth endpoints in production/development (disabled in test runs for speed)
  if (env.NODE_ENV !== 'test') {
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        status: 'error',
        message: 'Too many authentication requests, please try again later',
        error: { code: 'VALIDATION_ERROR', details: [] },
      },
    });
    app.use('/v1/auth', authLimiter);
  }

  // Branded Landing Page
  app.get('/', async (req: Request, res: Response) => {
    const dbHealth = await checkDbHealth();
    const acceptsHtml = req.headers.accept?.includes('text/html');
    if (acceptsHtml) {
      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(renderLandingPageHtml(dbHealth.connected, dbHealth.latencyMs));
      return;
    }

    sendSuccess(
      res,
      {
        service: APP_CONSTANTS.SERVICE_NAME,
        version: '1.0.0',
        environment: env.NODE_ENV,
        docsUrl: '/docs',
        healthUrl: '/health',
        database: dbHealth,
      },
      'Lendsqr Wallet Service is running',
      200,
    );
  });

  // Liveness & DB readiness check
  app.get('/health', async (_req: Request, res: Response) => {
    const dbHealth = await checkDbHealth();
    const statusCode = dbHealth.connected ? 200 : 503;
    sendSuccess(
      res,
      {
        service: APP_CONSTANTS.SERVICE_NAME,
        status: dbHealth.connected ? 'healthy' : 'degraded',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: dbHealth,
      },
      dbHealth.connected ? 'Service is healthy' : 'Database connection degraded',
      statusCode,
    );
  });

  // OpenAPI JSON & Branded Swagger UI
  app.get('/docs.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiSpec);
  });

  app.get('/docs', (_req: Request, res: Response) => {
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(renderSwaggerDocsHtml());
  });

  // API v1 Routes
  app.use('/v1/auth', authRouter);
  app.use('/v1/users', usersRouter);
  app.use('/v1/wallets', walletsRouter);
  app.use('/v1/webhooks', webhooksRouter);
  app.use('/v1/transfers', transfersRouter);
  app.use('/v1/transactions', transactionsRouter);
  app.use('/v1/admin', adminRouter);

  // 404 & Central Error Handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
