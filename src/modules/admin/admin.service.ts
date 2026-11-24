import { AppError } from '../../common/errors/AppError';
import { BlacklistRecord, TransactionRecord } from '../../common/types/entities';
import { formatKoboToNaira, toKoboInt } from '../../common/utils/money';
import { getDb } from '../../db/knex';
import { BlacklistService, blacklistService } from '../blacklist/blacklist.service';
import { UsersRepository, UserWithWalletDTO, usersRepository } from '../users/users.repository';
import { AddBlacklistInput, UserStatusActionInput } from './admin.schemas';

export interface AdminTransactionDTO {
  id: string;
  reference: string;
  type: 'funding' | 'transfer';
  status: 'pending' | 'successful' | 'failed';
  amountKobo: number;
  amountFormatted: string;
  currency: string;
  narration: string | null;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export class AdminService {
  constructor(
    private readonly usersRepo: UsersRepository = usersRepository,
    private readonly blacklist: BlacklistService = blacklistService,
  ) {}

  public async blockUser(
    userId: string,
    input: UserStatusActionInput,
  ): Promise<{ user: UserWithWalletDTO }> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw AppError.notFound(`User '${userId}' not found`);
    }

    await this.usersRepo.updateStatus(userId, 'blocked', input.reason);
    const updatedDto = await this.usersRepo.findUserWithWalletById(userId);
    if (!updatedDto) {
      throw AppError.notFound('User wallet not found');
    }

    return { user: updatedDto };
  }

  public async unblockUser(
    userId: string,
    _input: UserStatusActionInput,
  ): Promise<{ user: UserWithWalletDTO }> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw AppError.notFound(`User '${userId}' not found`);
    }

    await this.usersRepo.updateStatus(userId, 'active', null);
    const updatedDto = await this.usersRepo.findUserWithWalletById(userId);
    if (!updatedDto) {
      throw AppError.notFound('User wallet not found');
    }

    return { user: updatedDto };
  }

  public async listUsers(): Promise<UserWithWalletDTO[]> {
    return this.usersRepo.listUsersWithWallets();
  }

  public async addBlacklistIdentity(input: AddBlacklistInput): Promise<BlacklistRecord> {
    return this.blacklist.addToBlacklist(input.identity, input.reason);
  }

  public async removeBlacklistIdentity(identity: string): Promise<void> {
    await this.blacklist.removeFromBlacklist(identity);
  }

  public async listBlacklist(): Promise<BlacklistRecord[]> {
    return this.blacklist.listBlacklist();
  }

  public async listAllTransactions(): Promise<AdminTransactionDTO[]> {
    const db = getDb();
    const rows = await db<TransactionRecord>('transactions')
      .orderBy('created_at', 'desc')
      .limit(200);

    return rows.map((tx) => {
      const amountKobo = toKoboInt(tx.amount);
      return {
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        status: tx.status,
        amountKobo,
        amountFormatted: formatKoboToNaira(amountKobo),
        currency: tx.currency,
        narration: tx.narration,
        sourceWalletId: tx.source_wallet_id,
        destinationWalletId: tx.destination_wallet_id,
        metadata: tx.metadata,
        createdAt: tx.created_at,
      };
    });
  }
}

export const adminService = new AdminService();
