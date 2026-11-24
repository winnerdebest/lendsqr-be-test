import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiRequest,
  TransactionItem,
  UserProfile,
  WalletSummary,
} from '../api';

interface DashboardPageProps {
  user: UserProfile;
  onRefreshUser: () => Promise<void>;
}

export function DashboardPage({ user, onRefreshUser }: DashboardPageProps) {
  const [wallet, setWallet] = useState<WalletSummary>(user.wallet);
  const [recentTxs, setRecentTxs] = useState<TransactionItem[]>([]);
  const [amountNaira, setAmountNaira] = useState('5000');
  const [narration, setNarration] = useState('Wallet top-up');
  const [mode, setMode] = useState<'simulated' | 'paystack'>('simulated');
  const [funding, setFunding] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [pendingPaystackUrl, setPendingPaystackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadWalletAndTxs = async () => {
    try {
      const [wRes, txRes] = await Promise.all([
        apiRequest<WalletSummary>('/v1/wallets/me'),
        apiRequest<{ items: TransactionItem[] }>('/v1/transactions?limit=5'),
      ]);
      setWallet(wRes.data);
      setRecentTxs(txRes.data.items);
    } catch {
      // ignore initial load error
    }
  };

  useEffect(() => {
    void loadWalletAndTxs();
  }, []);

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setPendingPaystackUrl(null);

    const parsedNaira = Number(amountNaira);
    if (Number.isNaN(parsedNaira) || parsedNaira < 100) {
      setError('Minimum funding amount is ₦100.00');
      return;
    }

    const amountKobo = Math.round(parsedNaira * 100);
    const idempotencyKey = `fund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setFunding(true);
    try {
      const res = await apiRequest<{
        mode: 'paystack' | 'simulated';
        status: 'pending' | 'successful';
        reference: string;
        amountFormatted: string;
        authorizationUrl?: string;
      }>('/v1/wallets/fund', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          amountKobo,
          narration,
          mode,
          callbackUrl: `${window.location.origin}/dashboard`,
        },
      });

      if (res.data.status === 'pending' && res.data.authorizationUrl) {
        setPendingPaystackUrl(res.data.authorizationUrl);
        setVerifyingRef(res.data.reference);
        setSuccessMsg(
          `Paystack checkout initialized (Reference: ${res.data.reference}). Complete checkout, then click "Verify Paystack Payment" below.`,
        );
      } else {
        setSuccessMsg(
          `Funded ${res.data.amountFormatted} successfully! (Reference: ${res.data.reference})`,
        );
        await Promise.all([loadWalletAndTxs(), onRefreshUser()]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Funding failed');
    } finally {
      setFunding(false);
    }
  };

  const handleVerifyPaystack = async () => {
    if (!verifyingRef.trim()) return;
    setError(null);
    setFunding(true);
    try {
      const res = await apiRequest<{ reference: string; amountFormatted: string }>(
        `/v1/wallets/fund/verify/${encodeURIComponent(verifyingRef.trim())}`,
      );
      setSuccessMsg(
        `Paystack payment ${res.data.reference} verified! ${res.data.amountFormatted} credited.`,
      );
      setPendingPaystackUrl(null);
      await Promise.all([loadWalletAndTxs(), onRefreshUser()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setFunding(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wallet Dashboard</h1>
          <p style={{ fontSize: '0.9rem' }}>
            Welcome back, <strong>{user.firstName} {user.lastName}</strong> ({user.email})
          </p>
        </div>
        <Link to="/transfers" className="btn btn-teal">
          Send Money &rarr;
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Available Balance</div>
          <div className="stat-value">{wallet.balanceFormatted}</div>
          <div className="stat-sub">
            {wallet.balanceKobo.toLocaleString()} kobo ({wallet.currency})
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Wallet Account Number</div>
          <div className="stat-value mono" style={{ fontSize: '1.45rem' }}>
            {wallet.accountNumber}
          </div>
          <div className="stat-sub">Share with others to receive instant transfers</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Double-Entry Ledger Check</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>
            <span className={`badge ${wallet.isReconciled !== false ? 'badge-active' : 'badge-blocked'}`}>
              {wallet.isReconciled !== false ? 'Reconciled (Balanced)' : 'Mismatch'}
            </span>
          </div>
          <div className="stat-sub">Sum of credits minus debits matches wallet balance</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Account Status</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>
            <span className={`badge badge-${user.status}`}>{user.status}</span>
          </div>
          <div className="stat-sub">
            {user.blockedReason ? `Reason: ${user.blockedReason}` : 'Karma verified & active'}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Fund Your Wallet</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        <form onSubmit={handleFund}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount in Naira (₦)</label>
              <input
                type="number"
                min="100"
                step="1"
                className="form-input"
                value={amountNaira}
                onChange={(e) => setAmountNaira(e.target.value)}
                required
              />
              <div className="form-hint">
                Automatically sent to the API as{' '}
                <strong>{(Number(amountNaira || 0) * 100).toLocaleString()} kobo</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Funding Channel</label>
              <select
                className="form-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'simulated' | 'paystack')}
              >
                <option value="simulated">Instant Simulated Deposit (Immediate Credit)</option>
                <option value="paystack">Paystack Checkout (Test Mode)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Narration</label>
            <input
              type="text"
              className="form-input"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="e.g. Initial wallet funding"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-teal" disabled={funding}>
              {funding ? 'Processing...' : mode === 'paystack' ? 'Initialize Paystack Checkout' : 'Fund Wallet Instantly'}
            </button>

            {pendingPaystackUrl && (
              <>
                <a
                  href={pendingPaystackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-navy"
                >
                  Open Paystack Checkout Page &rarr;
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleVerifyPaystack}
                  disabled={funding}
                >
                  Verify Paystack Payment ({verifyingRef})
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent Transactions</h2>
          <Link to="/transactions" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            View All & Ledger Breakdown &rarr;
          </Link>
        </div>

        {recentTxs.length === 0 ? (
          <p style={{ fontSize: '0.9rem' }}>
            No transactions yet. Fund your wallet above to get started.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map((tx) => (
                  <tr key={tx.id}>
                    <td className="mono">{tx.reference}</td>
                    <td style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                    <td>
                      <span className={`badge badge-${tx.direction}`}>{tx.direction}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {tx.direction === 'outbound' ? '-' : '+'}
                      {tx.amountFormatted}
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                    </td>
                    <td>{new Date(tx.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
