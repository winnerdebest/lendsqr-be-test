export type UserStatus = 'active' | 'blocked';
export type TransactionType = 'funding' | 'transfer';
export type TransactionStatus = 'pending' | 'successful' | 'failed';
export type LedgerDirection = 'debit' | 'credit';
export type IdempotencyState = 'in_progress' | 'completed';
export type BlacklistSource = 'local' | 'karma';

export interface UserRecord {
  id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  status: UserStatus;
  blocked_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WalletRecord {
  id: string;
  user_id: string;
  account_number: string;
  currency: string;
  balance: string | number; // pg returns bigint as string
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRecord {
  id: string;
  reference: string;
  provider_reference: string | null;
  type: TransactionType;
  status: TransactionStatus;
  source_wallet_id: string | null;
  destination_wallet_id: string | null;
  amount: string | number;
  currency: string;
  narration: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerEntryRecord {
  id: string;
  transaction_id: string;
  wallet_id: string;
  direction: LedgerDirection;
  amount: string | number;
  balance_before: string | number;
  balance_after: string | number;
  created_at: Date;
}

export interface IdempotencyKeyRecord {
  id: string;
  user_id: string;
  key: string;
  endpoint: string;
  request_hash: string;
  state: IdempotencyState;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  created_at: Date;
  expires_at: Date;
}

export interface BlacklistRecord {
  id: string;
  identity: string;
  reason: string;
  source: BlacklistSource;
  created_at: Date;
}

export interface UserStatusEventRecord {
  id: string;
  user_id: string;
  action: 'blocked' | 'unblocked';
  reason: string;
  actor: string;
  created_at: Date;
}
