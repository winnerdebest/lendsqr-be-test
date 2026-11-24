import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
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

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors());

  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

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

  // OpenAPI JSON, Postman Collection JSON & Branded Swagger UI
  app.get('/docs.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiSpec);
  });

  app.get('/postman.json', (_req: Request, res: Response) => {
    const postmanPath = path.resolve(process.cwd(), 'postman_collection.json');
    if (fs.existsSync(postmanPath)) {
      res.sendFile(postmanPath);
      return;
    }
    res.status(404).json({ status: 'error', message: 'Postman collection not found' });
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

  // Serve built React Frontend (`dist/client`) for browser routes
  const clientDistDir = path.resolve(process.cwd(), 'dist/client');
  const clientIndexHtml = path.join(clientDistDir, 'index.html');

  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir, { index: false }));
  }

  app.get('*', async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/v1/')) {
      next();
      return;
    }

    const acceptsHtml = req.headers.accept?.includes('text/html');

    // If an API client requests JSON at `/`, return service metadata
    if (req.path === '/' && !acceptsHtml) {
      const dbHealth = await checkDbHealth();
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
      return;
    }

    // Serve React SPA index.html if built
    if (fs.existsSync(clientIndexHtml)) {
      res.sendFile(clientIndexHtml);
      return;
    }

    // Fallback landing HTML if client has not been built yet
    if (req.path === '/') {
      const dbHealth = await checkDbHealth();
      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(renderLandingPageHtml(dbHealth.connected, dbHealth.latencyMs));
      return;
    }

    next();
  });

  // 404 & Central Error Handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
