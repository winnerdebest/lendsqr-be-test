import crypto from 'crypto';
import { adminService } from '../../src/modules/admin/admin.service';
import { authService } from '../../src/modules/auth/auth.service';
import { PaystackClient } from '../../src/modules/wallets/paystack.client';
import { WalletsService } from '../../src/modules/wallets/wallets.service';
import {
  resetTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/testDb';

describe('WalletsService & AdminService (Unit Tests)', () => {
  let mockPaystack: jest.Mocked<PaystackClient>;
  let walletsService: WalletsService;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    mockPaystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    } as unknown as jest.Mocked<PaystackClient>;

    walletsService = new WalletsService(mockPaystack);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('Positive Cases', () => {
    it('funds wallet immediately in simulated mode and reconciles double-entry ledger balance', async () => {
      const { user } = await authService.register({
        email: 'sim.funder@lendsqr.com',
        phone: '+2348010001001',
        firstName: 'Sim',
        lastName: 'Funder',
        password: 'Password123!',
      });

      const fundResult = await walletsService.fundWallet(user.id, {
        amountKobo: 750000, // ₦7,500.00
        narration: 'Seed deposit',
        mode: 'simulated',
      });

      expect(fundResult.status).toBe('successful');
      expect(fundResult.amountKobo).toBe(750000);
      expect(fundResult.wallet?.balanceBeforeKobo).toBe(0);
      expect(fundResult.wallet?.balanceAfterKobo).toBe(750000);

      const walletDetails = await walletsService.getMyWallet(user.id);
      expect(walletDetails.balanceKobo).toBe(750000);
      expect(walletDetails.ledgerReconciledBalanceKobo).toBe(750000);
      expect(walletDetails.isReconciled).toBe(true);
    });

    it('initializes Paystack transaction, settles on verify, and prevents double-credit if webhook also fires', async () => {
      const { user } = await authService.register({
        email: 'paystack.user@lendsqr.com',
        phone: '+2348010001002',
        firstName: 'Paystack',
        lastName: 'User',
        password: 'Password123!',
      });

      mockPaystack.initializeTransaction.mockImplementation(async (params) => ({
        authorizationUrl: `https://checkout.paystack.com/${params.reference}`,
        accessCode: 'acc_test_123',
        reference: params.reference,
      }));

      const initResult = await walletsService.fundWallet(user.id, {
        amountKobo: 500000,
        narration: 'Paystack card funding',
        mode: 'paystack',
      });

      expect(initResult.status).toBe('pending');
      expect(initResult.authorizationUrl).toContain(initResult.reference);

      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: initResult.reference,
        amountKobo: 500000,
        currency: 'NGN',
        channel: 'card',
      });

      // 1st verification credits the wallet
      const verified1 = await walletsService.verifyPaystackFunding(initResult.reference);
      expect(verified1.status).toBe('successful');
      expect(verified1.wallet?.balanceAfterKobo).toBe(500000);

      // 2nd verification OR late webhook for the same reference MUST NOT double-credit
      mockPaystack.verifyWebhookSignature.mockReturnValue(true);
      await walletsService.handlePaystackWebhook(
        Buffer.from('{}'),
        'valid-sig',
        {
          event: 'charge.success',
          data: {
            reference: initResult.reference,
            amount: 500000,
            status: 'success',
          },
        },
      );

      const verified2 = await walletsService.verifyPaystackFunding(initResult.reference);
      expect(verified2.wallet?.balanceAfterKobo).toBe(500000);

      const finalWallet = await walletsService.getMyWallet(user.id);
      expect(finalWallet.balanceKobo).toBe(500000);
      expect(finalWallet.ledgerReconciledBalanceKobo).toBe(500000);
    });

    it('records audit trail events when admin blocks and unblocks a user', async () => {
      const { user } = await authService.register({
        email: 'audited.user@lendsqr.com',
        phone: '+2348010001003',
        firstName: 'Audited',
        lastName: 'User',
        password: 'Password123!',
      });

      const blocked = await adminService.blockUser(user.id, {
        reason: 'Velocity limit exceeded',
        actor: 'compliance-officer',
      });
      expect(blocked.user.status).toBe('blocked');
      expect(blocked.auditEvent.action).toBe('blocked');

      const unblocked = await adminService.unblockUser(user.id, {
        reason: 'KYC documents verified',
        actor: 'compliance-lead',
      });
      expect(unblocked.user.status).toBe('active');
      expect(unblocked.auditEvent.action).toBe('unblocked');

      const events = await adminService.getUserAuditEvents(user.id);
      expect(events).toHaveLength(2);
    });
  });

  describe('Negative Cases', () => {
    it('rejects funding when user account is blocked (403 USER_BLOCKED)', async () => {
      const { user } = await authService.register({
        email: 'blocked.funder@lendsqr.com',
        phone: '+2348010001004',
        firstName: 'Blocked',
        lastName: 'Funder',
        password: 'Password123!',
      });

      await adminService.blockUser(user.id, {
        reason: 'Account frozen',
        actor: 'admin',
      });

      await expect(
        walletsService.fundWallet(user.id, {
          amountKobo: 200000,
          narration: 'Attempted deposit while blocked',
          mode: 'simulated',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });

    it('rejects Paystack webhook with invalid HMAC-SHA512 signature (401 UNAUTHORIZED)', async () => {
      mockPaystack.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        walletsService.handlePaystackWebhook(
          Buffer.from('{"event":"charge.success"}'),
          'forged-signature',
          { event: 'charge.success' },
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });
    });

    it('marks transaction failed and throws 422 PAYMENT_VERIFICATION_FAILED if Paystack verification status is failed', async () => {
      const { user } = await authService.register({
        email: 'failed.card@lendsqr.com',
        phone: '+2348010001005',
        firstName: 'Failed',
        lastName: 'Card',
        password: 'Password123!',
      });

      mockPaystack.initializeTransaction.mockImplementation(async (params) => ({
        authorizationUrl: `https://checkout.paystack.com/${params.reference}`,
        accessCode: 'acc_fail_123',
        reference: params.reference,
      }));

      const init = await walletsService.fundWallet(user.id, {
        amountKobo: 300000,
        narration: 'Declined card',
        mode: 'paystack',
      });

      mockPaystack.verifyTransaction.mockResolvedValue({
        status: 'failed',
        reference: init.reference,
        amountKobo: 300000,
        currency: 'NGN',
      });

      await expect(walletsService.verifyPaystackFunding(init.reference)).rejects.toMatchObject({
        statusCode: 422,
        code: 'PAYMENT_VERIFICATION_FAILED',
      });

      const wallet = await walletsService.getMyWallet(user.id);
      expect(wallet.balanceKobo).toBe(0);
    });

    it('Verify PaystackClient HMAC-SHA512 signature helper rejects mismatched signatures and accepts valid HMAC', () => {
      const realClient = new PaystackClient(
        'https://api.paystack.co',
        'sk_test_sample_secret_key',
        'https://callback.url',
      );
      const rawPayload = Buffer.from('{"event":"charge.success","data":{"reference":"LSQ-1"}}');
      const validSignature = crypto
        .createHmac('sha512', 'sk_test_sample_secret_key')
        .update(rawPayload)
        .digest('hex');

      expect(realClient.verifyWebhookSignature(rawPayload, validSignature)).toBe(true);
      expect(realClient.verifyWebhookSignature(rawPayload, 'invalid_hex_signature')).toBe(false);
    });
  });
});
