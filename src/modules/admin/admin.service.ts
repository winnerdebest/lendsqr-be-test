import { AppError } from '../../common/errors/AppError';
import { BlacklistRecord, UserStatusEventRecord } from '../../common/types/entities';
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
  ): Promise<{ user: UserWithWalletDTO; auditEvent: UserStatusEventRecord }> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw AppError.notFound(`User '${userId}' not found`);
    }

    const { event } = await this.usersRepo.updateStatusWithAudit(
      userId,
      'blocked',
      input.reason,
      input.actor,
    );

    const updatedDto = await this.usersRepo.findUserWithWalletById(userId);
    if (!updatedDto) {
      throw AppError.notFound('User wallet not found');
    }

    return {
      user: updatedDto,
      auditEvent: event,
    };
  }

  public async unblockUser(
    userId: string,
    input: UserStatusActionInput,
  ): Promise<{ user: UserWithWalletDTO; auditEvent: UserStatusEventRecord }> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw AppError.notFound(`User '${userId}' not found`);
    }

    const { event } = await this.usersRepo.updateStatusWithAudit(
      userId,
      'active',
      input.reason,
      input.actor,
    );

    const updatedDto = await this.usersRepo.findUserWithWalletById(userId);
    if (!updatedDto) {
      throw AppError.notFound('User wallet not found');
    }

    return {
      user: updatedDto,
      auditEvent: event,
    };
  }

  public async listUsers(): Promise<UserWithWalletDTO[]> {
    return this.usersRepo.listUsersWithWallets();
  }

  public async getUserAuditEvents(userId: string): Promise<UserStatusEventRecord[]> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw AppError.notFound(`User '${userId}' not found`);
    }
    return this.usersRepo.getStatusHistory(userId);
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
