export interface WalletSummary {
  id: string;
  accountNumber: string;
  currency: string;
  balanceKobo: number;
  balanceFormatted: string;
  ledgerReconciledBalanceKobo?: number;
  isReconciled?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  hasPin: boolean;
  status: 'active' | 'blocked';
  blockedReason: string | null;
  createdAt: string;
  wallet: WalletSummary;
}

export interface AdminTransactionItem {
  id: string;
  reference: string;
  type: 'funding' | 'transfer';
  status: 'pending' | 'successful' | 'failed';
  amountKobo: number;
  amountFormatted: string;
  currency: string;
  narration: string | null;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  metadata: {
    senderEmail?: string;
    senderAccountNumber?: string;
    recipientEmail?: string;
    recipientAccountNumber?: string;
    provider?: string;
  } | null;
  createdAt: string;
}

export interface TransactionItem {
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
  createdAt: string;
}

export interface LedgerEntryItem {
  id: string;
  walletId: string;
  direction: 'debit' | 'credit';
  amountKobo: number;
  amountFormatted: string;
  balanceBeforeKobo: number;
  balanceAfterKobo: number;
  createdAt: string;
}

export interface TransactionDetail extends TransactionItem {
  ledgerEntries: LedgerEntryItem[];
}

export interface BlacklistEntry {
  id: string;
  identity: string;
  reason: string;
  source: 'local' | 'karma';
  created_at: string;
}

const TOKEN_KEY = 'lendsqr_access_token';

export function getSavedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    useAuth?: boolean;
  } = {},
): Promise<{ data: T; message: string; replayed: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.useAuth !== false) {
    const token = getSavedToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const replayed = response.headers.get('x-idempotent-replay') === 'true';
  const payload = await response.json();

  if (!response.ok || payload.status === 'error') {
    throw new Error(payload.message || 'Request failed');
  }

  return {
    data: payload.data as T,
    message: payload.message || 'Success',
    replayed,
  };
}
