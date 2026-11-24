import bcrypt from 'bcryptjs';
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
import { getDb } from '../../db/knex';
import { CreateTransferInput } from './transfers.schemas';

export interface TransferReceiptDTO {
  transactionId: string;
  reference: string;
  status: 'successful';
  type: 'transfer';
  amountKobo: number;
  amountFormatted: string;
  currency: string;
  narration: string;
  sender: {
    userId: string;
    email: string;
    name: string;
    walletId: string;
    accountNumber: string;
    balanceBeforeKobo: number;
    balanceAfterKobo: number;
    balanceFormatted: string;
  };
  recipient: {
    userId: string;
    email: string;
    name: string;
    walletId: string;
    accountNumber: string;
  };
  createdAt: Date;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TransfersService {
  private get db(): Knex {
    return getDb();
  }

  /**
   * Resolves a recipient wallet and user by:
   * 1. Email address (case-insensitive)
   * 2. 10-digit NUBAN account number (e.g. "9012345678")
   * 3. Wallet UUID or User UUID
   */
  public async resolveRecipient(
    identifier: string,
    trx: Knex.Transaction,
  ): Promise<{ user: UserRecord; wallet: WalletRecord }> {
    const clean = identifier.trim();

    let user: UserRecord | undefined;
    let wallet: WalletRecord | undefined;

    if (clean.includes('@')) {
      user = await trx<UserRecord>('users').where('email', clean.toLowerCase()).first();
      if (user) {
        wallet = await trx<WalletRecord>('wallets').where('user_id', user.id).first();
      }
    } else if (/^\d{10}$/.test(clean)) {
      wallet = await trx<WalletRecord>('wallets').where('account_number', clean).first();
      if (wallet) {
        user = await trx<UserRecord>('users').where('id', wallet.user_id).first();
      }
    } else if (UUID_REGEX.test(clean)) {
      wallet = await trx<WalletRecord>('wallets').where('id', clean).first();
      if (wallet) {
        user = await trx<UserRecord>('users').where('id', wallet.user_id).first();
      } else {
        user = await trx<UserRecord>('users').where('id', clean).first();
        if (user) {
          wallet = await trx<WalletRecord>('wallets').where('user_id', user.id).first();
        }
      }
    }

    if (!user || !wallet) {
      throw AppError.notFound(`Recipient wallet or user '${clean}' not found`);
    }

    return { user, wallet };
  }

  /**
   * Executes an atomic Wallet A -> Wallet B transfer using PostgreSQL pessimistic row locks:
   * `SELECT * FROM wallets WHERE id IN (id1, id2) ORDER BY id ASC FOR UPDATE`
   */
  public async transferFunds(
    senderUserId: string,
    input: CreateTransferInput,
  ): Promise<TransferReceiptDTO> {
    if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw AppError.unprocessable(
        'Transfer amount must be a positive integer in kobo',
        'INVALID_AMOUNT',
      );
    }

    return this.db.transaction(async (trx) => {
      // 1. Fetch sender user and wallet
      const senderUser = await trx<UserRecord>('users').where('id', senderUserId).first();
      if (!senderUser) {
        throw AppError.notFound('Sender user account not found');
      }

      if (senderUser.status === 'blocked') {
        throw AppError.forbidden(
          `Transfer denied: your account is blocked${senderUser.blocked_reason ? ` (${senderUser.blocked_reason})` : ''}`,
          'USER_BLOCKED',
        );
      }

      // If the user has configured a 4-digit transfer PIN, verify it before proceeding
      if (senderUser.pin_hash) {
        if (!input.pin) {
          throw AppError.forbidden(
            'Your 4-digit transfer PIN is required to authorize this transfer',
            'FORBIDDEN',
          );
        }
        const pinMatches = await bcrypt.compare(input.pin, senderUser.pin_hash);
        if (!pinMatches) {
          throw AppError.forbidden('Incorrect 4-digit transfer PIN', 'FORBIDDEN');
        }
      }

      const senderWalletInitial = await trx<WalletRecord>('wallets')
        .where('user_id', senderUser.id)
        .first();
      if (!senderWalletInitial) {
        throw AppError.notFound('Sender wallet not found');
      }

      // 2. Resolve recipient user and wallet
      const { user: recipientUser, wallet: recipientWalletInitial } = await this.resolveRecipient(
        input.recipientIdentifier,
        trx,
      );

      // 3. Reject self-transfer
      if (
        senderUser.id === recipientUser.id ||
        senderWalletInitial.id === recipientWalletInitial.id
      ) {
        throw AppError.unprocessable(
          'Cannot transfer funds to your own wallet',
          'SELF_TRANSFER',
        );
      }

      // 4. Reject transfers to a blocked recipient
      if (recipientUser.status === 'blocked') {
        throw AppError.forbidden(
          'Transfer denied: recipient account is currently blocked and cannot receive funds',
          'RECIPIENT_BLOCKED',
        );
      }

      // 5. Acquire pessimistic row locks in deterministic sorted order to prevent deadlocks
      const sortedWalletIds = [senderWalletInitial.id, recipientWalletInitial.id].sort();
      const lockedWallets = await trx<WalletRecord>('wallets')
        .whereIn('id', sortedWalletIds)
        .orderBy('id', 'asc')
        .forUpdate();

      const lockedSenderWallet = lockedWallets.find((w) => w.id === senderWalletInitial.id);
      const lockedRecipientWallet = lockedWallets.find((w) => w.id === recipientWalletInitial.id);

      if (!lockedSenderWallet || !lockedRecipientWallet) {
        throw AppError.notFound('Unable to lock sender and recipient wallets for transfer');
      }

      // 6. Check sender balance under exclusive row lock
      const senderBalanceBefore = toKoboInt(lockedSenderWallet.balance);
      const recipientBalanceBefore = toKoboInt(lockedRecipientWallet.balance);

      if (senderBalanceBefore < input.amountKobo) {
        throw AppError.unprocessable(
          `Insufficient wallet balance: available ${formatKoboToNaira(senderBalanceBefore)}, required ${formatKoboToNaira(input.amountKobo)}`,
          'INSUFFICIENT_FUNDS',
          [{ availableKobo: senderBalanceBefore, requiredKobo: input.amountKobo }],
        );
      }

      const senderBalanceAfter = senderBalanceBefore - input.amountKobo;
      const recipientBalanceAfter = recipientBalanceBefore + input.amountKobo;
      const now = new Date();
      const transactionId = crypto.randomUUID();
      const reference = generateReference('LSQ-TRF');
      const narration = input.narration || 'Wallet to wallet transfer';

      // 7. Update both wallet balances atomically
      await trx<WalletRecord>('wallets').where('id', lockedSenderWallet.id).update({
        balance: senderBalanceAfter,
        updated_at: now,
      });

      await trx<WalletRecord>('wallets').where('id', lockedRecipientWallet.id).update({
        balance: recipientBalanceAfter,
        updated_at: now,
      });

      // 8. Record transaction and double-entry ledger entries (debit + credit)
      await trx<TransactionRecord>('transactions').insert({
        id: transactionId,
        reference,
        provider_reference: null,
        type: 'transfer',
        status: 'successful',
        source_wallet_id: lockedSenderWallet.id,
        destination_wallet_id: lockedRecipientWallet.id,
        amount: input.amountKobo,
        currency: 'NGN',
        narration,
        failure_reason: null,
        metadata: {
          senderEmail: senderUser.email,
          senderAccountNumber: lockedSenderWallet.account_number,
          recipientEmail: recipientUser.email,
          recipientAccountNumber: lockedRecipientWallet.account_number,
        },
        created_at: now,
        updated_at: now,
      });

      await trx<LedgerEntryRecord>('ledger_entries').insert([
        {
          id: crypto.randomUUID(),
          transaction_id: transactionId,
          wallet_id: lockedSenderWallet.id,
          direction: 'debit',
          amount: input.amountKobo,
          balance_before: senderBalanceBefore,
          balance_after: senderBalanceAfter,
          created_at: now,
        },
        {
          id: crypto.randomUUID(),
          transaction_id: transactionId,
          wallet_id: lockedRecipientWallet.id,
          direction: 'credit',
          amount: input.amountKobo,
          balance_before: recipientBalanceBefore,
          balance_after: recipientBalanceAfter,
          created_at: now,
        },
      ]);

      return {
        transactionId,
        reference,
        status: 'successful',
        type: 'transfer',
        amountKobo: input.amountKobo,
        amountFormatted: formatKoboToNaira(input.amountKobo),
        currency: 'NGN',
        narration,
        sender: {
          userId: senderUser.id,
          email: senderUser.email,
          name: `${senderUser.first_name} ${senderUser.last_name}`,
          walletId: lockedSenderWallet.id,
          accountNumber: lockedSenderWallet.account_number,
          balanceBeforeKobo: senderBalanceBefore,
          balanceAfterKobo: senderBalanceAfter,
          balanceFormatted: formatKoboToNaira(senderBalanceAfter),
        },
        recipient: {
          userId: recipientUser.id,
          email: recipientUser.email,
          name: `${recipientUser.first_name} ${recipientUser.last_name}`,
          walletId: lockedRecipientWallet.id,
          accountNumber: lockedRecipientWallet.account_number,
        },
        createdAt: now,
      };
    });
  }
}

export const transfersService = new TransfersService();
