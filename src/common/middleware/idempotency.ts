import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { APP_CONSTANTS } from '../../config/env';
import { getDb } from '../../db/knex';
import { AppError } from '../errors/AppError';
import { IdempotencyKeyRecord } from '../types/entities';

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return `{${entries.join(',')}}`;
}

export function computeRequestHash(method: string, path: string, body: unknown): string {
  const payload = `${method.toUpperCase()}:${path}:${canonicalizeJson(body ?? {})}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function parseStoredBody(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return raw as Record<string, unknown>;
}

/**
 * Middleware that enforces Idempotency-Key protection on money-moving endpoints.
 */
export function requireIdempotency(req: Request, res: Response, next: NextFunction): void {
  const run = async (): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw AppError.unauthorized('Authenticated user required for idempotent operation');
    }

    const rawKey = req.headers['idempotency-key'];
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';

    if (!key) {
      throw AppError.badRequest(
        'Idempotency-Key header is required for this financial operation',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }

    if (key.length > 128) {
      throw AppError.badRequest(
        'Idempotency-Key header must not exceed 128 characters',
        'VALIDATION_ERROR',
      );
    }

    const endpoint = `${req.method.toUpperCase()} ${req.baseUrl}${req.path}`;
    const requestHash = computeRequestHash(req.method, `${req.baseUrl}${req.path}`, req.body);
    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + APP_CONSTANTS.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
    );

    // 1. Delete any expired key with the same (user_id, key)
    await db<IdempotencyKeyRecord>('idempotency_keys')
      .where({ user_id: userId, key })
      .andWhere('expires_at', '<', now)
      .del();

    // 2. Check if an active idempotency key record already exists
    const existing = await db<IdempotencyKeyRecord>('idempotency_keys')
      .where({ user_id: userId, key })
      .first();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw AppError.unprocessable(
          'Idempotency-Key has already been used with a different request payload',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }

      if (existing.state === 'in_progress') {
        throw AppError.conflict(
          'A request with this Idempotency-Key is currently being processed',
          'REQUEST_IN_PROGRESS',
        );
      }

      const storedBody = parseStoredBody(existing.response_body);
      res.setHeader('X-Idempotent-Replay', 'true');
      res.status(existing.response_status || 200).json(storedBody);
      return;
    }

    // 3. Claim key atomically via unique constraint on (user_id, key)
    const recordId = crypto.randomUUID();
    try {
      await db<IdempotencyKeyRecord>('idempotency_keys').insert({
        id: recordId,
        user_id: userId,
        key,
        endpoint,
        request_hash: requestHash,
        state: 'in_progress',
        response_status: null,
        response_body: null,
        created_at: now,
        expires_at: expiresAt,
      });
    } catch (insertError) {
      const raced = await db<IdempotencyKeyRecord>('idempotency_keys')
        .where({ user_id: userId, key })
        .first();

      if (raced) {
        if (raced.request_hash !== requestHash) {
          throw AppError.unprocessable(
            'Idempotency-Key has already been used with a different request payload',
            'IDEMPOTENCY_KEY_REUSED',
          );
        }
        const racedBody = parseStoredBody(raced.response_body);
        if (raced.state === 'completed' && racedBody) {
          res.setHeader('X-Idempotent-Replay', 'true');
          res.status(raced.response_status || 200).json(racedBody);
          return;
        }
        throw AppError.conflict(
          'A request with this Idempotency-Key is currently being processed',
          'REQUEST_IN_PROGRESS',
        );
      }
      throw insertError;
    }

    // 4. Persist response before flushing HTTP reply
    const originalJson = res.json.bind(res);
    let finalized = false;

    res.json = ((body: unknown) => {
      if (finalized) {
        return originalJson(body);
      }
      finalized = true;
      const statusCode = res.statusCode;

      const persistPromise =
        statusCode >= 200 && statusCode < 300
          ? db<IdempotencyKeyRecord>('idempotency_keys')
              .where('id', recordId)
              .update({
                state: 'completed',
                response_status: statusCode,
                response_body: JSON.stringify(body) as unknown as Record<string, unknown>,
              })
          : db<IdempotencyKeyRecord>('idempotency_keys').where('id', recordId).del();

      void persistPromise
        .catch(() => undefined)
        .finally(() => {
          originalJson(body);
        });

      return res;
    }) as Response['json'];

    next();
  };

  run().catch(next);
}
