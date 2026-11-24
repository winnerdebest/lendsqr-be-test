import { adminService } from '../../src/modules/admin/admin.service';
import { authService } from '../../src/modules/auth/auth.service';
import { transactionsService } from '../../src/modules/transactions/transactions.service';
import { transfersService } from '../../src/modules/transfers/transfers.service';
import { walletsService } from '../../src/modules/wallets/wallets.service';
import {
  resetTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/testDb';

describe('TransfersService (Unit Tests — Positive & Negative Edge Cases)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function createFundedUser(
    email: string,
    phone: string,
    firstName: string,
    lastName: string,
    initialBalanceKobo: number,
  ) {
    const { user } = await authService.register({
      email,
      phone,
      firstName,
      lastName,
      password: 'Password123!',
    });

    if (initialBalanceKobo > 0) {
      await walletsService.fundWallet(user.id, {
        amountKobo: initialBalanceKobo,
        narration: 'Initial test balance',
        mode: 'simulated',
      });
    }

    return user;
  }

  describe('Positive Cases', () => {
    it('transfers funds by recipient email, updates both balances atomically, and creates debit + credit double-entry ledger records', async () => {
      const sender = await createFundedUser(
        'sender@lendsqr.com',
        '+2348020001001',
        'Chidi',
        'Okafor',
        1000000, // ₦10,000.00
      );
      const recipient = await createFundedUser(
        'recipient@lendsqr.com',
        '+2348020001002',
        'Zainab',
        'Bello',
        200000, // ₦2,000.00
      );

      const receipt = await transfersService.transferFunds(sender.id, {
        recipientIdentifier: 'recipient@lendsqr.com',
        amountKobo: 350000, // ₦3,500.00
        narration: 'Supplier payment',
      });

      expect(receipt.status).toBe('successful');
      expect(receipt.amountKobo).toBe(350000);
      expect(receipt.sender.balanceBeforeKobo).toBe(1000000);
      expect(receipt.sender.balanceAfterKobo).toBe(650000);

      const senderWallet = await walletsService.getMyWallet(sender.id);
      const recipientWallet = await walletsService.getMyWallet(recipient.id);

      expect(senderWallet.balanceKobo).toBe(650000);
      expect(senderWallet.isReconciled).toBe(true);
      expect(recipientWallet.balanceKobo).toBe(550000);
      expect(recipientWallet.isReconciled).toBe(true);

      // Verify double-entry ledger entries (1 debit + 1 credit)
      const txDetail = await transactionsService.getTransactionByReference(
        sender.id,
        receipt.reference,
      );
      expect(txDetail.ledgerEntries).toHaveLength(2);
      const debit = txDetail.ledgerEntries.find((e) => e.direction === 'debit');
      const credit = txDetail.ledgerEntries.find((e) => e.direction === 'credit');
      expect(debit?.amountKobo).toBe(350000);
      expect(debit?.balanceBeforeKobo).toBe(1000000);
      expect(debit?.balanceAfterKobo).toBe(650000);
      expect(credit?.amountKobo).toBe(350000);
      expect(credit?.balanceBeforeKobo).toBe(200000);
      expect(credit?.balanceAfterKobo).toBe(550000);
    });

    it('supports transferring funds using the recipient 10-digit NUBAN account number or wallet UUID', async () => {
      const sender = await createFundedUser(
        'nuban.sender@lendsqr.com',
        '+2348020001003',
        'Tunde',
        'Bakare',
        500000,
      );
      const recipient = await createFundedUser(
        'nuban.recipient@lendsqr.com',
        '+2348020001004',
        'Ngozi',
        'Eze',
        0,
      );

      // Transfer by 10-digit account number
      const r1 = await transfersService.transferFunds(sender.id, {
        recipientIdentifier: recipient.wallet.accountNumber,
        amountKobo: 100000,
        narration: 'Transfer via NUBAN',
      });
      expect(r1.recipient.accountNumber).toBe(recipient.wallet.accountNumber);

      // Transfer by wallet UUID
      const r2 = await transfersService.transferFunds(sender.id, {
        recipientIdentifier: recipient.wallet.id,
        amountKobo: 150000,
        narration: 'Transfer via Wallet UUID',
      });
      expect(r2.recipient.walletId).toBe(recipient.wallet.id);

      const recipientWallet = await walletsService.getMyWallet(recipient.id);
      expect(recipientWallet.balanceKobo).toBe(250000);
    });
  });

  describe('Negative Cases', () => {
    it('rejects transfer when sender has insufficient funds (422 INSUFFICIENT_FUNDS) and leaves balances unchanged', async () => {
      const sender = await createFundedUser(
        'low.balance@lendsqr.com',
        '+2348020001005',
        'Low',
        'Balance',
        100000, // ₦1,000.00
      );
      const recipient = await createFundedUser(
        'target@lendsqr.com',
        '+2348020001006',
        'Target',
        'User',
        50000,
      );

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: recipient.email,
          amountKobo: 250000, // ₦2,500.00
          narration: 'Overdraft attempt',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INSUFFICIENT_FUNDS',
      });

      const senderWallet = await walletsService.getMyWallet(sender.id);
      const recipientWallet = await walletsService.getMyWallet(recipient.id);
      expect(senderWallet.balanceKobo).toBe(100000);
      expect(recipientWallet.balanceKobo).toBe(50000);
    });

    it('rejects self-transfer (Wallet A -> Wallet A) with 422 SELF_TRANSFER', async () => {
      const sender = await createFundedUser(
        'self@lendsqr.com',
        '+2348020001007',
        'Self',
        'Sender',
        500000,
      );

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: sender.email,
          amountKobo: 50000,
          narration: 'Loopback transfer',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'SELF_TRANSFER',
      });

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: sender.wallet.accountNumber,
          amountKobo: 50000,
          narration: 'Loopback transfer by account number',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'SELF_TRANSFER',
      });
    });

    it('rejects transfer when sender account is blocked (403 USER_BLOCKED)', async () => {
      const sender = await createFundedUser(
        'blocked.sender@lendsqr.com',
        '+2348020001008',
        'Blocked',
        'Sender',
        500000,
      );
      const recipient = await createFundedUser(
        'clean.recipient@lendsqr.com',
        '+2348020001009',
        'Clean',
        'Recipient',
        0,
      );

      await adminService.blockUser(sender.id, {
        reason: 'Account under investigation',
      });

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: recipient.email,
          amountKobo: 100000,
          narration: 'Attempt by blocked sender',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });

    it('rejects transfer when recipient account is blocked (403 RECIPIENT_BLOCKED)', async () => {
      const sender = await createFundedUser(
        'active.sender@lendsqr.com',
        '+2348020001010',
        'Active',
        'Sender',
        500000,
      );
      const recipient = await createFundedUser(
        'frozen.recipient@lendsqr.com',
        '+2348020001011',
        'Frozen',
        'Recipient',
        0,
      );

      await adminService.blockUser(recipient.id, {
        reason: 'Recipient wallet frozen',
      });

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: recipient.email,
          amountKobo: 100000,
          narration: 'Attempt to blocked recipient',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'RECIPIENT_BLOCKED',
      });
    });

    it('rejects transfer to non-existent recipient with 404 NOT_FOUND', async () => {
      const sender = await createFundedUser(
        'valid.sender@lendsqr.com',
        '+2348020001012',
        'Valid',
        'Sender',
        500000,
      );

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: 'ghost.user@lendsqr.com',
          amountKobo: 50000,
          narration: 'Ghost recipient',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('rejects invalid non-positive or non-integer amounts with 422 INVALID_AMOUNT', async () => {
      const sender = await createFundedUser(
        'math.sender@lendsqr.com',
        '+2348020001013',
        'Math',
        'Sender',
        500000,
      );
      const recipient = await createFundedUser(
        'math.recipient@lendsqr.com',
        '+2348020001014',
        'Math',
        'Recipient',
        0,
      );

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: recipient.email,
          amountKobo: -5000,
          narration: 'Negative transfer',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_AMOUNT',
      });

      await expect(
        transfersService.transferFunds(sender.id, {
          recipientIdentifier: recipient.email,
          amountKobo: 123.45,
          narration: 'Floating point transfer',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_AMOUNT',
      });
    });
  });
});
