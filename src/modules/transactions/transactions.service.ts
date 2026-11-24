import { Knex } from 'knex';
import { z } from 'zod';
import { AppError } from '../../common/errors/AppError';
import {
  LedgerEntryRecord,
  TransactionRecord,
  WalletRecord,
} from '../../common/types/entities';
import { formatKoboToNaira, toKoboInt } from '../../common/utils/money';
import { getDb } from '../../db/knex';

export const listTransactionsQuerySchema = z.object({
  type: z.enum(['funding', 'transfer']).optional(),
  status: z.enum(['pending', 'successful', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export interface TransactionDTO {
  id: string;
  reference: string;
  providerReference: string | null;
  type: 'funding' | 'transfer';
  status: 'pending' | 'successful' | 'failed';
  direction: 'inbound' | 'outbound';
  amountKobo: number;
  amountFormatted: string;
  currency: string;
  narration: string | null;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface TransactionDetailDTO extends TransactionDTO {
  ledgerEntries: Array<{
    id: string;
    walletId: string;
    direction: 'debit' | 'credit';
    amountKobo: number;
    amountFormatted: string;
    balanceBeforeKobo: number;
    balanceAfterKobo: number;
    createdAt: Date;
  }>;
}

export class TransactionsService {
  private get db(): Knex {
    return getDb();
  }

  public async listUserTransactions(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<{
    items: TransactionDTO[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const wallet = await this.db<WalletRecord>('wallets').where('user_id', userId).first();
    if (!wallet) {
      throw AppError.notFound('Wallet not found for current user');
    }

    const allInvolvingWallet = await this.db<TransactionRecord>('transactions')
      .where('source_wallet_id', wallet.id)
      .orWhere('destination_wallet_id', wallet.id)
      .orderBy('created_at', 'desc');

    const filtered = allInvolvingWallet.filter((tx) => {
      if (query.type && tx.type !== query.type) return false;
      if (query.status && tx.status !== query.status) return false;
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const offset = (query.page - 1) * query.limit;
    const paged = filtered.slice(offset, offset + query.limit);

    const items = paged.map((tx) => this.toTransactionDTO(tx, wallet.id));

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  public async getTransactionByReference(
    userId: string,
    reference: string,
  ): Promise<TransactionDetailDTO> {
    const wallet = await this.db<WalletRecord>('wallets').where('user_id', userId).first();
    if (!wallet) {
      throw AppError.notFound('Wallet not found for current user');
    }

    const tx = await this.db<TransactionRecord>('transactions')
      .where('reference', reference)
      .first();

    if (
      !tx ||
      (tx.source_wallet_id !== wallet.id && tx.destination_wallet_id !== wallet.id)
    ) {
      throw AppError.notFound(`Transaction '${reference}' not found for your wallet`);
    }

    const ledgerRows = await this.db<LedgerEntryRecord>('ledger_entries')
      .where('transaction_id', tx.id)
      .orderBy('created_at', 'asc');

    const baseDto = this.toTransactionDTO(tx, wallet.id);

    return {
      ...baseDto,
      ledgerEntries: ledgerRows.map((entry) => {
        const amt = toKoboInt(entry.amount);
        return {
          id: entry.id,
          walletId: entry.wallet_id,
          direction: entry.direction,
          amountKobo: amt,
          amountFormatted: formatKoboToNaira(amt),
          balanceBeforeKobo: toKoboInt(entry.balance_before),
          balanceAfterKobo: toKoboInt(entry.balance_after),
          createdAt: entry.created_at,
        };
      }),
    };
  }

  private toTransactionDTO(tx: TransactionRecord, viewerWalletId: string): TransactionDTO {
    const amountKobo = toKoboInt(tx.amount);
    const direction = tx.source_wallet_id === viewerWalletId ? 'outbound' : 'inbound';

    return {
      id: tx.id,
      reference: tx.reference,
      providerReference: tx.provider_reference,
      type: tx.type,
      status: tx.status,
      direction,
      amountKobo,
      amountFormatted: formatKoboToNaira(amountKobo),
      currency: tx.currency,
      narration: tx.narration,
      sourceWalletId: tx.source_wallet_id,
      destinationWalletId: tx.destination_wallet_id,
      metadata: tx.metadata,
      createdAt: tx.created_at,
    };
  }
}

export const transactionsService = new TransactionsService();
