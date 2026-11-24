import crypto from 'crypto';
import { Knex } from 'knex';
import { AppError } from '../../common/errors/AppError';
import {
  LedgerEntryRecord,
  TransactionRecord,
  UserRecord,
  WalletRecord,
} from '../../common/types/entities';
import { formatKoboToNaira, generateReference, toKoboInt } from '../../common/utils/money';
import { walletLockManager } from '../../common/utils/lockManager';
import { getDb } from '../../db/knex';
import { PaystackClient, paystackClient } from './paystack.client';
import { FundWalletInput } from './wallets.schemas';

export interface WalletDetailsDTO {
  id: string;
  userId: string;
  accountNumber: string;
  currency: string;
  balanceKobo: number;
  balanceFormatted: string;
  ledgerReconciledBalanceKobo: number;
  isReconciled: boolean;
  updatedAt: Date;
}

export interface FundingResultDTO {
  mode: 'paystack' | 'simulated';
  status: 'pending' | 'successful';
  reference: string;
  amountKobo: number;
  amountFormatted: string;
  narration: string;
  authorizationUrl?: string;
  accessCode?: string;
  wallet?: {
    id: string;
    accountNumber: string;
    balanceBeforeKobo: number;
    balanceAfterKobo: number;
    balanceFormatted: string;
  };
}

export class WalletsService {
  constructor(private readonly paystack: PaystackClient = paystackClient) {}

  private get db(): Knex {
    return getDb();
  }

  public async getMyWallet(userId: string): Promise<WalletDetailsDTO> {
    const wallet = await this.db<WalletRecord>('wallets').where('user_id', userId).first();
    if (!wallet) {
      throw AppError.notFound('Wallet not found for current user');
    }

    const entries = await this.db<LedgerEntryRecord>('ledger_entries').where(
      'wallet_id',
      wallet.id,
    );

    let ledgerNetKobo = 0;
    for (const entry of entries) {
      const amt = toKoboInt(entry.amount);
      ledgerNetKobo += entry.direction === 'credit' ? amt : -amt;
    }

    const balanceKobo = toKoboInt(wallet.balance);

    return {
      id: wallet.id,
      userId: wallet.user_id,
      accountNumber: wallet.account_number,
      currency: wallet.currency,
      balanceKobo,
      balanceFormatted: formatKoboToNaira(balanceKobo),
      ledgerReconciledBalanceKobo: ledgerNetKobo,
      isReconciled: balanceKobo === ledgerNetKobo,
      updatedAt: wallet.updated_at,
    };
  }

  /**
   * Initializes or executes wallet funding:
   * - If `mode === 'paystack'` (or `mode === 'auto'` when `PAYSTACK_SECRET_KEY` is configured),
   *   creates a `pending` funding transaction and calls Paystack `/transaction/initialize`.
   * - If `mode === 'simulated'` (or `mode === 'auto'` when `PAYSTACK_SECRET_KEY` is not set),
   *   atomically credits the wallet inside a `SELECT ... FOR UPDATE` transaction and writes
   *   the double-entry credit ledger record immediately.
   */
  public async fundWallet(userId: string, input: FundWalletInput): Promise<FundingResultDTO> {
    const user = await this.db<UserRecord>('users').where('id', userId).first();
    if (!user) {
      throw AppError.notFound('User account not found');
    }

    if (user.status === 'blocked') {
      throw AppError.forbidden(
        `Blocked accounts cannot fund wallets${user.blocked_reason ? `: ${user.blocked_reason}` : ''}`,
        'USER_BLOCKED',
      );
    }

    const wallet = await this.db<WalletRecord>('wallets').where('user_id', userId).first();
    if (!wallet) {
      throw AppError.notFound('Wallet not found');
    }

    const usePaystack =
      input.mode === 'paystack' || (input.mode === 'auto' && this.paystack.isConfigured());

    const reference = generateReference('LSQ-FND');
    const narration = input.narration || 'Wallet funding deposit';

    if (usePaystack) {
      // 1. Insert pending transaction first (outside external HTTP lock)
      const now = new Date();
      const pendingTx: TransactionRecord = {
        id: crypto.randomUUID(),
        reference,
        provider_reference: reference,
        type: 'funding',
        status: 'pending',
        source_wallet_id: null,
        destination_wallet_id: wallet.id,
        amount: input.amountKobo,
        currency: 'NGN',
        narration,
        failure_reason: null,
        metadata: { provider: 'paystack', userId },
        created_at: now,
        updated_at: now,
      };

      await this.db<TransactionRecord>('transactions').insert(pendingTx);

      // 2. Call Paystack API outside any DB lock
      const paystackInit = await this.paystack.initializeTransaction({
        email: user.email,
        amountKobo: input.amountKobo,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: {
          userId: user.id,
          walletId: wallet.id,
          accountNumber: wallet.account_number,
        },
      });

      return {
        mode: 'paystack',
        status: 'pending',
        reference,
        amountKobo: input.amountKobo,
        amountFormatted: formatKoboToNaira(input.amountKobo),
        narration,
        authorizationUrl: paystackInit.authorizationUrl,
        accessCode: paystackInit.accessCode,
      };
    }

    // Simulated / Instant Funding Mode (atomic row lock + ledger entry)
    return this.executeImmediateFundingCredit({
      walletId: wallet.id,
      reference,
      providerReference: `SIM-${reference}`,
      amountKobo: input.amountKobo,
      narration,
      metadata: { provider: 'simulated', userId },
    });
  }

  /**
   * Verifies a Paystack transaction by reference and idempotently credits the wallet.
   * Safe to call multiple times or concurrently with the Paystack webhook.
   */
  public async verifyPaystackFunding(reference: string): Promise<FundingResultDTO> {
    const existingTx = await this.db<TransactionRecord>('transactions')
      .where('reference', reference)
      .orWhere('provider_reference', reference)
      .first();

    if (!existingTx) {
      throw AppError.notFound(`Funding transaction '${reference}' not found`);
    }

    if (existingTx.type !== 'funding' || !existingTx.destination_wallet_id) {
      throw AppError.unprocessable(
        `Transaction '${reference}' is not a valid funding transaction`,
        'PAYMENT_VERIFICATION_FAILED',
      );
    }

    // If already credited (e.g. via webhook), return idempotent success
    if (existingTx.status === 'successful') {
      const wallet = await this.db<WalletRecord>('wallets')
        .where('id', existingTx.destination_wallet_id)
        .first();
      const ledgerEntry = await this.db<LedgerEntryRecord>('ledger_entries')
        .where('transaction_id', existingTx.id)
        .first();

      const amountKobo = toKoboInt(existingTx.amount);
      const balanceAfterKobo = ledgerEntry
        ? toKoboInt(ledgerEntry.balance_after)
        : wallet
          ? toKoboInt(wallet.balance)
          : amountKobo;
      const balanceBeforeKobo = ledgerEntry
        ? toKoboInt(ledgerEntry.balance_before)
        : balanceAfterKobo - amountKobo;

      return {
        mode: 'paystack',
        status: 'successful',
        reference: existingTx.reference,
        amountKobo,
        amountFormatted: formatKoboToNaira(amountKobo),
        narration: existingTx.narration || 'Wallet funding deposit',
        wallet: wallet
          ? {
              id: wallet.id,
              accountNumber: wallet.account_number,
              balanceBeforeKobo,
              balanceAfterKobo,
              balanceFormatted: formatKoboToNaira(balanceAfterKobo),
            }
          : undefined,
      };
    }

    // Verify with Paystack API outside DB transaction lock
    const verification = await this.paystack.verifyTransaction(reference);

    if (verification.status !== 'success') {
      await this.db<TransactionRecord>('transactions')
        .where('id', existingTx.id)
        .andWhere('status', 'pending')
        .update({
          status: 'failed',
          failure_reason: `Paystack status: ${verification.status}`,
          updated_at: new Date(),
        });

      throw AppError.unprocessable(
        `Payment verification failed: Paystack status is '${verification.status}'`,
        'PAYMENT_VERIFICATION_FAILED',
      );
    }

    return this.settlePendingPaystackTransaction(
      existingTx.reference,
      verification.amountKobo,
      {
        channel: verification.channel,
        paidAt: verification.paidAt,
      },
    );
  }

  /**
   * Processes an authentic Paystack `charge.success` webhook event idempotently.
   */
  public async handlePaystackWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
    payload: {
      event?: string;
      data?: {
        reference?: string;
        amount?: number;
        status?: string;
        channel?: string;
        paid_at?: string;
      };
    },
  ): Promise<{ processed: boolean; reference?: string }> {
    if (!this.paystack.verifyWebhookSignature(rawBody, signatureHeader)) {
      throw AppError.unauthorized('Invalid x-paystack-signature webhook HMAC');
    }

    if (payload.event !== 'charge.success' || !payload.data?.reference) {
      return { processed: false };
    }

    const reference = payload.data.reference;
    const amountKobo = Number(payload.data.amount || 0);

    const tx = await this.db<TransactionRecord>('transactions')
      .where('reference', reference)
      .orWhere('provider_reference', reference)
      .first();

    if (!tx || tx.type !== 'funding') {
      return { processed: false, reference };
    }

    if (tx.status === 'successful') {
      return { processed: true, reference: tx.reference };
    }

    await this.settlePendingPaystackTransaction(tx.reference, amountKobo, {
      webhookEvent: payload.event,
      channel: payload.data.channel,
      paidAt: payload.data.paid_at,
    });

    return { processed: true, reference: tx.reference };
  }

  /**
   * Atomically locks the pending funding transaction + destination wallet `FOR UPDATE`,
   * ensures it has not already been settled, updates the balance, and records the credit ledger entry.
   */
  public async settlePendingPaystackTransaction(
    reference: string,
    verifiedAmountKobo: number,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<FundingResultDTO> {
    return walletLockManager.withLocks([`funding:${reference}`], async () =>
      this.db.transaction(async (trx) => {
      const tx = await trx<TransactionRecord>('transactions')
        .where('reference', reference)
        .forUpdate()
        .first();

      if (!tx || !tx.destination_wallet_id) {
        throw AppError.notFound(`Pending funding transaction '${reference}' not found`);
      }

      const wallet = await trx<WalletRecord>('wallets')
        .where('id', tx.destination_wallet_id)
        .forUpdate()
        .first();

      if (!wallet) {
        throw AppError.notFound('Destination wallet not found');
      }

      // Double-credit guard: if another concurrent webhook/verify call already settled it
      if (tx.status === 'successful') {
        const currentBalance = toKoboInt(wallet.balance);
        const amount = toKoboInt(tx.amount);
        return {
          mode: 'paystack',
          status: 'successful',
          reference: tx.reference,
          amountKobo: amount,
          amountFormatted: formatKoboToNaira(amount),
          narration: tx.narration || 'Wallet funding deposit',
          wallet: {
            id: wallet.id,
            accountNumber: wallet.account_number,
            balanceBeforeKobo: currentBalance - amount,
            balanceAfterKobo: currentBalance,
            balanceFormatted: formatKoboToNaira(currentBalance),
          },
        };
      }

      const creditAmount = verifiedAmountKobo > 0 ? verifiedAmountKobo : toKoboInt(tx.amount);
      const balanceBefore = toKoboInt(wallet.balance);
      const balanceAfter = balanceBefore + creditAmount;
      const now = new Date();

      await trx<WalletRecord>('wallets').where('id', wallet.id).update({
        balance: balanceAfter,
        updated_at: now,
      });

      await trx<TransactionRecord>('transactions')
        .where('id', tx.id)
        .update({
          status: 'successful',
          amount: creditAmount,
          metadata: { ...(tx.metadata || {}), ...extraMetadata },
          updated_at: now,
        });

      const ledgerEntry: LedgerEntryRecord = {
        id: crypto.randomUUID(),
        transaction_id: tx.id,
        wallet_id: wallet.id,
        direction: 'credit',
        amount: creditAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        created_at: now,
      };

      await trx<LedgerEntryRecord>('ledger_entries').insert(ledgerEntry);

      return {
        mode: 'paystack',
        status: 'successful',
        reference: tx.reference,
        amountKobo: creditAmount,
        amountFormatted: formatKoboToNaira(creditAmount),
        narration: tx.narration || 'Wallet funding deposit',
        wallet: {
          id: wallet.id,
          accountNumber: wallet.account_number,
          balanceBeforeKobo: balanceBefore,
          balanceAfterKobo: balanceAfter,
          balanceFormatted: formatKoboToNaira(balanceAfter),
        },
      };
    }),
    );
  }

  private async executeImmediateFundingCredit(params: {
    walletId: string;
    reference: string;
    providerReference: string;
    amountKobo: number;
    narration: string;
    metadata: Record<string, unknown>;
  }): Promise<FundingResultDTO> {
    return walletLockManager.withLocks([`wallet:${params.walletId}`], async () =>
      this.db.transaction(async (trx) => {
      const lockedWallet = await trx<WalletRecord>('wallets')
        .where('id', params.walletId)
        .forUpdate()
        .first();

      if (!lockedWallet) {
        throw AppError.notFound('Wallet not found');
      }

      const balanceBefore = toKoboInt(lockedWallet.balance);
      const balanceAfter = balanceBefore + params.amountKobo;
      const now = new Date();
      const txId = crypto.randomUUID();

      await trx<WalletRecord>('wallets').where('id', lockedWallet.id).update({
        balance: balanceAfter,
        updated_at: now,
      });

      const txRecord: TransactionRecord = {
        id: txId,
        reference: params.reference,
        provider_reference: params.providerReference,
        type: 'funding',
        status: 'successful',
        source_wallet_id: null,
        destination_wallet_id: lockedWallet.id,
        amount: params.amountKobo,
        currency: 'NGN',
        narration: params.narration,
        failure_reason: null,
        metadata: params.metadata,
        created_at: now,
        updated_at: now,
      };

      await trx<TransactionRecord>('transactions').insert(txRecord);

      const ledgerEntry: LedgerEntryRecord = {
        id: crypto.randomUUID(),
        transaction_id: txId,
        wallet_id: lockedWallet.id,
        direction: 'credit',
        amount: params.amountKobo,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        created_at: now,
      };

      await trx<LedgerEntryRecord>('ledger_entries').insert(ledgerEntry);

      return {
        mode: 'simulated',
        status: 'successful',
        reference: params.reference,
        amountKobo: params.amountKobo,
        amountFormatted: formatKoboToNaira(params.amountKobo),
        narration: params.narration,
        wallet: {
          id: lockedWallet.id,
          accountNumber: lockedWallet.account_number,
          balanceBeforeKobo: balanceBefore,
          balanceAfterKobo: balanceAfter,
          balanceFormatted: formatKoboToNaira(balanceAfter),
        },
      };
    }),
    );
  }
}

export const walletsService = new WalletsService();
