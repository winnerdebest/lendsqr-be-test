import { AppError } from '../../common/errors/AppError';
import { BlacklistRecord } from '../../common/types/entities';
import { BlacklistService, blacklistService } from '../blacklist/blacklist.service';
import { UsersRepository, UserWithWalletDTO, usersRepository } from '../users/users.repository';
import { AddBlacklistInput, UserStatusActionInput } from './admin.schemas';

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
}

export const adminService = new AdminService();
