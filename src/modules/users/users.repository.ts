import crypto from 'crypto';
import { Knex } from 'knex';
import { UserRecord, UserStatus, UserStatusEventRecord, WalletRecord } from '../../common/types/entities';
import { formatKoboToNaira, generateAccountNumber, toKoboInt } from '../../common/utils/money';
import { getDb } from '../../db/knex';

export interface CreateUserWithWalletInput {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}

export interface UserWithWalletDTO {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  blockedReason: string | null;
  createdAt: Date;
  wallet: {
    id: string;
    accountNumber: string;
    currency: string;
    balanceKobo: number;
    balanceFormatted: string;
  };
}

export class UsersRepository {
  private get db(): Knex {
    return getDb();
  }

  public normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  public normalizePhone(phone: string): string {
    return phone.trim();
  }

  public async findById(id: string, trx?: Knex.Transaction): Promise<UserRecord | undefined> {
    return (trx || this.db)<UserRecord>('users').where('id', id).first();
  }

  public async findByEmail(email: string, trx?: Knex.Transaction): Promise<UserRecord | undefined> {
    return (trx || this.db)<UserRecord>('users')
      .where('email', this.normalizeEmail(email))
      .first();
  }

  public async findByPhone(phone: string, trx?: Knex.Transaction): Promise<UserRecord | undefined> {
    return (trx || this.db)<UserRecord>('users')
      .where('phone', this.normalizePhone(phone))
      .first();
  }

  public async createUserAndWallet(
    input: CreateUserWithWalletInput,
  ): Promise<{ user: UserRecord; wallet: WalletRecord }> {
    return this.db.transaction(async (trx) => {
      const now = new Date();
      const userId = crypto.randomUUID();
      const walletId = crypto.randomUUID();

      let accountNumber = generateAccountNumber();
      for (let attempt = 0; attempt < 5; attempt++) {
        const collision = await trx<WalletRecord>('wallets')
          .where('account_number', accountNumber)
          .first();
        if (!collision) break;
        accountNumber = generateAccountNumber();
      }

      const user: UserRecord = {
        id: userId,
        email: this.normalizeEmail(input.email),
        phone: this.normalizePhone(input.phone),
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        password_hash: input.passwordHash,
        status: 'active',
        blocked_reason: null,
        created_at: now,
        updated_at: now,
      };

      const wallet: WalletRecord = {
        id: walletId,
        user_id: userId,
        account_number: accountNumber,
        currency: 'NGN',
        balance: 0,
        created_at: now,
        updated_at: now,
      };

      await trx<UserRecord>('users').insert(user);
      await trx<WalletRecord>('wallets').insert(wallet);

      return { user, wallet };
    });
  }

  public async findUserWithWalletById(userId: string): Promise<UserWithWalletDTO | undefined> {
    const user = await this.findById(userId);
    if (!user) return undefined;

    const wallet = await this.db<WalletRecord>('wallets').where('user_id', user.id).first();
    if (!wallet) return undefined;

    return this.toUserWithWalletDTO(user, wallet);
  }

  public async updateStatusWithAudit(
    userId: string,
    status: UserStatus,
    reason: string,
    actor = 'admin',
  ): Promise<{ user: UserRecord; event: UserStatusEventRecord }> {
    return this.db.transaction(async (trx) => {
      const now = new Date();
      const blockedReason = status === 'blocked' ? reason : null;

      await trx<UserRecord>('users').where('id', userId).update({
        status,
        blocked_reason: blockedReason,
        updated_at: now,
      });

      const updatedUser = await trx<UserRecord>('users').where('id', userId).first();
      if (!updatedUser) {
        throw new Error('User disappeared during status update');
      }

      const event: UserStatusEventRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        action: status === 'blocked' ? 'blocked' : 'unblocked',
        reason,
        actor,
        created_at: now,
      };

      await trx<UserStatusEventRecord>('user_status_events').insert(event);

      return { user: updatedUser, event };
    });
  }

  public async listUsersWithWallets(): Promise<UserWithWalletDTO[]> {
    const users = await this.db<UserRecord>('users').orderBy('created_at', 'desc');
    const wallets = await this.db<WalletRecord>('wallets');
    const walletByUserId = new Map<string, WalletRecord>();
    for (const w of wallets) {
      walletByUserId.set(w.user_id, w);
    }

    return users
      .map((u) => {
        const w = walletByUserId.get(u.id);
        return w ? this.toUserWithWalletDTO(u, w) : undefined;
      })
      .filter((item): item is UserWithWalletDTO => Boolean(item));
  }

  public async getStatusHistory(userId: string): Promise<UserStatusEventRecord[]> {
    return this.db<UserStatusEventRecord>('user_status_events')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');
  }

  public toUserWithWalletDTO(user: UserRecord, wallet: WalletRecord): UserWithWalletDTO {
    const balanceKobo = toKoboInt(wallet.balance);
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      blockedReason: user.blocked_reason,
      createdAt: user.created_at,
      wallet: {
        id: wallet.id,
        accountNumber: wallet.account_number,
        currency: wallet.currency,
        balanceKobo,
        balanceFormatted: formatKoboToNaira(balanceKobo),
      },
    };
  }
}

export const usersRepository = new UsersRepository();
