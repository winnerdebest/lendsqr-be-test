import crypto from 'crypto';
import { Knex } from 'knex';
import { BlacklistRecord, BlacklistSource } from '../../common/types/entities';
import { getDb } from '../../db/knex';

export class BlacklistRepository {
  private get db(): Knex {
    return getDb();
  }

  public normalizeIdentity(identity: string): string {
    return identity.trim().toLowerCase();
  }

  public async findByIdentity(identity: string, trx?: Knex.Transaction): Promise<BlacklistRecord | undefined> {
    const query = (trx || this.db)<BlacklistRecord>('blacklist');
    return query.where('identity', this.normalizeIdentity(identity)).first();
  }

  public async findMatchingIdentities(identities: string[]): Promise<BlacklistRecord[]> {
    const normalized = identities.map((id) => this.normalizeIdentity(id)).filter(Boolean);
    if (normalized.length === 0) {
      return [];
    }
    return this.db<BlacklistRecord>('blacklist').whereIn('identity', normalized);
  }

  public async upsert(
    identity: string,
    reason: string,
    source: BlacklistSource = 'local',
  ): Promise<BlacklistRecord> {
    const normalized = this.normalizeIdentity(identity);
    const existing = await this.findByIdentity(normalized);
    if (existing) {
      return existing;
    }

    const record: BlacklistRecord = {
      id: crypto.randomUUID(),
      identity: normalized,
      reason,
      source,
      created_at: new Date(),
    };

    await this.db<BlacklistRecord>('blacklist').insert(record);
    return record;
  }

  public async removeByIdentity(identity: string): Promise<boolean> {
    const normalized = this.normalizeIdentity(identity);
    const deletedCount = await this.db<BlacklistRecord>('blacklist')
      .where('identity', normalized)
      .del();
    return deletedCount > 0;
  }

  public async listAll(): Promise<BlacklistRecord[]> {
    return this.db<BlacklistRecord>('blacklist').orderBy('created_at', 'desc');
  }
}

export const blacklistRepository = new BlacklistRepository();
