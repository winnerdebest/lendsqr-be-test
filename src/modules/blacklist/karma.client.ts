import { AppError } from '../../common/errors/AppError';
import { APP_CONSTANTS, env } from '../../config/env';

export interface KarmaCheckResult {
  blacklisted: boolean;
  identity: string;
  reason?: string;
  source: 'karma';
}

interface AdjutorKarmaApiResponse {
  status?: string;
  message?: string;
  'mock-response'?: string;
  data?: {
    karma_identity?: string;
    amount_in_contention?: string;
    reason?: string | null;
    default_date?: string | null;
    karma_type?: { karma?: string };
  } | null;
}

export class KarmaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly failClosed: boolean;

  constructor(
    baseUrl = APP_CONSTANTS.ADJUTOR_BASE_URL,
    apiKey = env.NODE_ENV === 'test' ? '' : env.ADJUTOR_API_KEY,
    failClosed = false,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.failClosed = failClosed;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'mock');
  }

  /**
   * Queries Lendsqr Adjutor Karma endpoint: GET /v2/verification/karma/:identity
   * Scope required on Adjutor app: "Karma Lookup"
   */
  public async checkIdentity(identity: string): Promise<KarmaCheckResult> {
    const normalized = identity.trim();
    if (!this.isConfigured()) {
      return {
        blacklisted: false,
        identity: normalized,
        source: 'karma',
      };
    }

    const url = `${this.baseUrl}/verification/karma/${encodeURIComponent(normalized)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 404) {
        return {
          blacklisted: false,
          identity: normalized,
          source: 'karma',
        };
      }

      if (!response.ok) {
        if (this.failClosed) {
          throw AppError.serviceUnavailable(
            `Lendsqr Adjutor Karma verification service returned HTTP ${response.status}`,
          );
        }
        return {
          blacklisted: false,
          identity: normalized,
          source: 'karma',
        };
      }

      const body = (await response.json()) as AdjutorKarmaApiResponse;

      if (body && body.status === 'success' && body.data && body.data.karma_identity) {
        const returnedIdentity = body.data.karma_identity.trim().toLowerCase();
        const queriedIdentity = normalized.toLowerCase();

        // In Adjutor Test Mode (`"mock-response"` present), Adjutor always returns a sample
        // payload with `karma_identity: "0zspgifzbo.ga"` regardless of what identity was queried.
        // Therefore, in test mode we only flag the identity if it actually matches `returnedIdentity`.
        const isMockResponse = Boolean(body['mock-response']);
        if (isMockResponse && returnedIdentity !== queriedIdentity) {
          return {
            blacklisted: false,
            identity: normalized,
            source: 'karma',
          };
        }

        const reason =
          body.data.reason ||
          body.data.karma_type?.karma ||
          'Flagged on Lendsqr Adjutor Karma blacklist';
        return {
          blacklisted: true,
          identity: normalized,
          reason,
          source: 'karma',
        };
      }

      return {
        blacklisted: false,
        identity: normalized,
        source: 'karma',
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (this.failClosed) {
        throw AppError.serviceUnavailable(
          'Unable to reach Lendsqr Adjutor Karma verification service',
        );
      }
      return {
        blacklisted: false,
        identity: normalized,
        source: 'karma',
      };
    }
  }
}

export const karmaClient = new KarmaClient();
