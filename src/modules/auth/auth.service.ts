import bcrypt from 'bcryptjs';
import { AppError } from '../../common/errors/AppError';
import { signAccessToken } from '../../common/middleware/auth';
import { APP_CONSTANTS } from '../../config/env';
import { BlacklistService, blacklistService } from '../blacklist/blacklist.service';
import { UsersRepository, UserWithWalletDTO, usersRepository } from '../users/users.repository';
import { LoginInput, RegisterInput } from './auth.schemas';

export interface AuthResponseDTO {
  accessToken: string;
  user: UserWithWalletDTO;
}

export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository = usersRepository,
    private readonly blacklist: BlacklistService = blacklistService,
  ) {}

  public async register(input: RegisterInput): Promise<AuthResponseDTO> {
    const normalizedEmail = this.usersRepo.normalizeEmail(input.email);
    const normalizedPhone = this.usersRepo.normalizePhone(input.phone);

    const existingByEmail = await this.usersRepo.findByEmail(normalizedEmail);
    if (existingByEmail) {
      throw AppError.conflict(
        `An account with email '${normalizedEmail}' already exists`,
        'DUPLICATE_USER',
      );
    }

    const existingByPhone = await this.usersRepo.findByPhone(normalizedPhone);
    if (existingByPhone) {
      throw AppError.conflict(
        `An account with phone '${normalizedPhone}' already exists`,
        'DUPLICATE_USER',
      );
    }

    await this.blacklist.assertNotBlacklisted([normalizedEmail, normalizedPhone]);

    const passwordHash = await bcrypt.hash(input.password, APP_CONSTANTS.BCRYPT_SALT_ROUNDS);
    const { user, wallet } = await this.usersRepo.createUserAndWallet({
      email: normalizedEmail,
      phone: normalizedPhone,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    });

    const userDto = this.usersRepo.toUserWithWalletDTO(user, wallet);
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
    });

    return {
      accessToken,
      user: userDto,
    };
  }

  public async login(input: LoginInput): Promise<AuthResponseDTO> {
    const normalizedEmail = this.usersRepo.normalizeEmail(input.email);
    const user = await this.usersRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
    if (!passwordMatches) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (user.status === 'blocked') {
      throw AppError.forbidden(
        `Your account is currently blocked${user.blocked_reason ? `: ${user.blocked_reason}` : ''}`,
        'USER_BLOCKED',
      );
    }

    const userWithWallet = await this.usersRepo.findUserWithWalletById(user.id);
    if (!userWithWallet) {
      throw AppError.notFound('User wallet record not found');
    }

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
    });

    return {
      accessToken,
      user: userWithWallet,
    };
  }

  public async getProfile(userId: string): Promise<UserWithWalletDTO> {
    const profile = await this.usersRepo.findUserWithWalletById(userId);
    if (!profile) {
      throw AppError.notFound('User account not found');
    }
    return profile;
  }

  public async setTransferPin(userId: string, pin: string): Promise<UserWithWalletDTO> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw AppError.notFound('User account not found');
    }

    const pinHash = await bcrypt.hash(pin, APP_CONSTANTS.BCRYPT_SALT_ROUNDS);
    await this.usersRepo.updatePinHash(userId, pinHash);

    const updated = await this.usersRepo.findUserWithWalletById(userId);
    if (!updated) {
      throw AppError.notFound('User account not found');
    }
    return updated;
  }
}

export const authService = new AuthService();
