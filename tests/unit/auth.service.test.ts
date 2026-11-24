import bcrypt from 'bcryptjs';
import { AppError } from '../../src/common/errors/AppError';
import { UserRecord, WalletRecord } from '../../src/common/types/entities';
import { AuthService } from '../../src/modules/auth/auth.service';
import { BlacklistService } from '../../src/modules/blacklist/blacklist.service';
import { UsersRepository } from '../../src/modules/users/users.repository';

describe('AuthService (Unit Tests)', () => {
  let mockUsersRepo: jest.Mocked<UsersRepository>;
  let mockBlacklistService: jest.Mocked<BlacklistService>;
  let authService: AuthService;

  const sampleUser: UserRecord = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'ada.obi@lendsqr.com',
    phone: '+2348012345678',
    first_name: 'Ada',
    last_name: 'Obi',
    password_hash: bcrypt.hashSync('Password123!', 4),
    role: 'user',
    status: 'active',
    blocked_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const sampleWallet: WalletRecord = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: sampleUser.id,
    account_number: '9012345678',
    currency: 'NGN',
    balance: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockUsersRepo = {
      normalizeEmail: jest.fn((e: string) => e.trim().toLowerCase()),
      normalizePhone: jest.fn((p: string) => p.trim()),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      createUserAndWallet: jest.fn(),
      findUserWithWalletById: jest.fn(),
      toUserWithWalletDTO: jest.fn().mockReturnValue({
        id: sampleUser.id,
        email: sampleUser.email,
        phone: sampleUser.phone,
        firstName: sampleUser.first_name,
        lastName: sampleUser.last_name,
        role: 'user',
        status: 'active',
        blockedReason: null,
        createdAt: sampleUser.created_at,
        wallet: {
          id: sampleWallet.id,
          accountNumber: sampleWallet.account_number,
          currency: 'NGN',
          balanceKobo: 0,
          balanceFormatted: '₦0.00',
        },
      }),
    } as unknown as jest.Mocked<UsersRepository>;

    mockBlacklistService = {
      assertNotBlacklisted: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BlacklistService>;

    authService = new AuthService(mockUsersRepo, mockBlacklistService);
  });

  describe('Positive Cases', () => {
    it('registers a clean user, creates an NGN wallet with 0 kobo balance, and returns a signed JWT', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(undefined);
      mockUsersRepo.findByPhone.mockResolvedValue(undefined);
      mockUsersRepo.createUserAndWallet.mockResolvedValue({
        user: sampleUser,
        wallet: sampleWallet,
      });

      const result = await authService.register({
        email: 'Ada.Obi@lendsqr.com',
        phone: '+2348012345678',
        firstName: 'Ada',
        lastName: 'Obi',
        password: 'Password123!',
      });

      expect(mockBlacklistService.assertNotBlacklisted).toHaveBeenCalledWith([
        'ada.obi@lendsqr.com',
        '+2348012345678',
      ]);
      expect(mockUsersRepo.createUserAndWallet).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBeDefined();
      expect(result.user.wallet.accountNumber).toBe('9012345678');
      expect(result.user.wallet.balanceKobo).toBe(0);
    });

    it('authenticates an active user with valid credentials and returns JWT', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(sampleUser);
      mockUsersRepo.findUserWithWalletById.mockResolvedValue(
        mockUsersRepo.toUserWithWalletDTO(sampleUser, sampleWallet),
      );

      const result = await authService.login({
        email: 'ada.obi@lendsqr.com',
        password: 'Password123!',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('ada.obi@lendsqr.com');
    });
  });

  describe('Negative Cases', () => {
    it('rejects duplicate email registration with 409 DUPLICATE_USER', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(sampleUser);

      await expect(
        authService.register({
          email: 'ada.obi@lendsqr.com',
          phone: '+2348099990000',
          firstName: 'Ada',
          lastName: 'Obi',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_USER',
      });

      expect(mockUsersRepo.createUserAndWallet).not.toHaveBeenCalled();
    });

    it('rejects duplicate phone registration with 409 DUPLICATE_USER', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(undefined);
      mockUsersRepo.findByPhone.mockResolvedValue(sampleUser);

      await expect(
        authService.register({
          email: 'new.user@lendsqr.com',
          phone: '+2348012345678',
          firstName: 'New',
          lastName: 'User',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_USER',
      });
    });

    it('rejects registration when blacklist service throws 403 USER_BLACKLISTED', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(undefined);
      mockUsersRepo.findByPhone.mockResolvedValue(undefined);
      mockBlacklistService.assertNotBlacklisted.mockRejectedValue(
        AppError.forbidden('User is blacklisted on Karma', 'USER_BLACKLISTED'),
      );

      await expect(
        authService.register({
          email: 'fraud@lendsqr.com',
          phone: '+2348055554444',
          firstName: 'Fraud',
          lastName: 'Actor',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLACKLISTED',
      });

      expect(mockUsersRepo.createUserAndWallet).not.toHaveBeenCalled();
    });

    it('rejects login with wrong password with 401 UNAUTHORIZED', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(sampleUser);

      await expect(
        authService.login({
          email: 'ada.obi@lendsqr.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects login when user account is blocked with 403 USER_BLOCKED', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...sampleUser,
        status: 'blocked',
        blocked_reason: 'Compliance review',
      });

      await expect(
        authService.login({
          email: 'ada.obi@lendsqr.com',
          password: 'Password123!',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });
  });
});
