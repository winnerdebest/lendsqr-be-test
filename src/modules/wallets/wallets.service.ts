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
import { realtimeHub } from '../../common/utils/realtime';
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
   * Initializes Paystack funding (when Paystack is configured or requested)
   * or credits the wallet immediately in simulated mode.
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
    const now = new Date();

    // Always create a pending funding transaction first
    await this.db<TransactionRecord>('transactions').insert({
      id: crypto.randomUUID(),
      reference,
      provider_reference: usePaystack ? reference : `SIM-${reference}`,
      type: 'funding',
      status: 'pending',
      source_wallet_id: null,
      destination_wallet_id: wallet.id,
      amount: input.amountKobo,
      currency: 'NGN',
      narration,
      failure_reason: null,
      metadata: { provider: usePaystack ? 'paystack' : 'simulated', userId },
      created_at: now,
      updated_at: now,
    });

    if (usePaystack) {
      const paystackInit = await this.paystack.initializeTransaction({
        email: user.email,
        amountKobo: input.amountKobo,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: { userId: user.id, walletId: wallet.id },
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

    // Simulated mode settles the pending transaction immediately via the same atomic credit method
    return this.settleFundingTransaction(reference, input.amountKobo, 'simulated');
  }

  /**
   * Verifies a Paystack transaction by reference and idempotently credits the wallet.
   */
  public async verifyPaystackFunding(reference: string): Promise<FundingResultDTO> {
    const existingTx = await this.db<TransactionRecord>('transactions')
      .where('reference', reference)
      .orWhere('provider_reference', reference)
      .first();

    if (!existingTx || existingTx.type !== 'funding' || !existingTx.destination_wallet_id) {
      throw AppError.notFound(`Funding transaction '${reference}' not found`);
    }

    if (existingTx.status === 'successful') {
      return this.settleFundingTransaction(
        existingTx.reference,
        toKoboInt(existingTx.amount),
        'paystack',
      );
    }

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

    return this.settleFundingTransaction(
      existingTx.reference,
      verification.amountKobo,
      'paystack',
      { channel: verification.channel, paidAt: verification.paidAt },
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
    const tx = await this.db<TransactionRecord>('transactions')
      .where('reference', reference)
      .orWhere('provider_reference', reference)
      .first();

    if (!tx || tx.type !== 'funding') {
      return { processed: false, reference };
    }

    await this.settleFundingTransaction(
      tx.reference,
      Number(payload.data.amount || 0),
      'paystack',
      {
        webhookEvent: payload.event,
        channel: payload.data.channel,
        paidAt: payload.data.paid_at,
      },
    );

    return { processed: true, reference: tx.reference };
  }

  /**
   * Single atomic settlement method used by simulated funding, Paystack verify, and Paystack webhooks.
   * Locks both the transaction row and wallet row with `SELECT ... FOR UPDATE` so a reference can never be credited twice.
   */
  private async settleFundingTransaction(
    reference: string,
    verifiedAmountKobo: number,
    mode: 'paystack' | 'simulated',
    extraMetadata: Record<string, unknown> = {},
  ): Promise<FundingResultDTO> {
    const result = await this.db.transaction(async (trx) => {
      const tx = await trx<TransactionRecord>('transactions')
        .where('reference', reference)
        .forUpdate()
        .first();

      if (!tx || !tx.destination_wallet_id) {
        throw AppError.notFound(`Funding transaction '${reference}' not found`);
      }

      const wallet = await trx<WalletRecord>('wallets')
        .where('id', tx.destination_wallet_id)
        .forUpdate()
        .first();

      if (!wallet) {
        throw AppError.notFound('Destination wallet not found');
      }

      // Already credited -> return idempotently without modifying balance
      if (tx.status === 'successful') {
        const currentBalance = toKoboInt(wallet.balance);
        const amount = toKoboInt(tx.amount);
        return {
          alreadySettled: true,
          userId: wallet.user_id,
          dto: {
            mode,
            status: 'successful' as const,
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

      await trx<LedgerEntryRecord>('ledger_entries').insert({
        id: crypto.randomUUID(),
        transaction_id: tx.id,
        wallet_id: wallet.id,
        direction: 'credit',
        amount: creditAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        created_at: now,
      });

      return {
        alreadySettled: false,
        userId: wallet.user_id,
        dto: {
          mode,
          status: 'successful' as const,
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
        },
      };
    });

    if (!result.alreadySettled) {
      realtimeHub.notifyUser(result.userId, {
        type: 'wallet_funded',
        reference: result.dto.reference,
        amountFormatted: result.dto.amountFormatted,
        narration: result.dto.narration,
        timestamp: new Date().toISOString(),
      });
    }

    return result.dto;
  }
}

export const walletsService = new WalletsService();
