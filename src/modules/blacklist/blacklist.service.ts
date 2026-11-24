import { AppError } from '../../common/errors/AppError';
import { BlacklistRecord } from '../../common/types/entities';
import { BlacklistRepository, blacklistRepository } from './blacklist.repository';
import { KarmaClient, karmaClient } from './karma.client';

export class BlacklistService {
  constructor(
    private readonly repo: BlacklistRepository = blacklistRepository,
    private readonly karma: KarmaClient = karmaClient,
  ) {}

  /**
   * Verifies that none of the provided identities (e.g. email, phone) appear on:
   * 1. The local PostgreSQL `blacklist` table
   * 2. The Lendsqr Adjutor Karma blacklist API (if configured)
   */
  public async assertNotBlacklisted(identities: string[]): Promise<void> {
    const cleanIdentities = identities.map((i) => i.trim()).filter(Boolean);

    // 1. Check local blacklist table first (fast SQL lookup)
    const localMatches = await this.repo.findMatchingIdentities(cleanIdentities);
    if (localMatches.length > 0) {
      const match = localMatches[0];
      throw AppError.forbidden(
        `Onboarding denied: identity '${match.identity}' is blacklisted (${match.reason})`,
        'USER_BLACKLISTED',
        [{ identity: match.identity, source: match.source, reason: match.reason }],
      );
    }

    // 2. Check Lendsqr Adjutor Karma API for each identity
    for (const identity of cleanIdentities) {
      const karmaResult = await this.karma.checkIdentity(identity);
      if (karmaResult.blacklisted) {
        const reason = karmaResult.reason || 'Flagged on Lendsqr Adjutor Karma blacklist';
        // Cache Karma hit locally so repeat attempts don't cost additional Adjutor API credits
        await this.repo.upsert(identity, reason, 'karma');
        throw AppError.forbidden(
          `Onboarding denied: identity '${identity}' is blacklisted on Lendsqr Karma (${reason})`,
          'USER_BLACKLISTED',
          [{ identity, source: 'karma', reason }],
        );
      }
    }
  }

  public async addToBlacklist(identity: string, reason: string): Promise<BlacklistRecord> {
    return this.repo.upsert(identity, reason, 'local');
  }

  public async removeFromBlacklist(identity: string): Promise<void> {
    const removed = await this.repo.removeByIdentity(identity);
    if (!removed) {
      throw AppError.notFound(`Identity '${identity}' was not found in the local blacklist`);
    }
  }

  public async listBlacklist(): Promise<BlacklistRecord[]> {
    return this.repo.listAll();
  }
}

export const blacklistService = new BlacklistService();
