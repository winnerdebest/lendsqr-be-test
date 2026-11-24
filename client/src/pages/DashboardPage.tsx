import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  apiRequest,
  TransactionItem,
  UserProfile,
  WalletSummary,
} from '../api';
import { useToast } from '../components/ToastProvider';

interface DashboardPageProps {
  user: UserProfile;
  liveTick: number;
  onRefreshUser: () => Promise<void>;
}

export function DashboardPage({ user, liveTick, onRefreshUser }: DashboardPageProps) {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [wallet, setWallet] = useState<WalletSummary>(user.wallet);
  const [recentTxs, setRecentTxs] = useState<TransactionItem[]>([]);
  const [amountNaira, setAmountNaira] = useState('5000');
  const [narration, setNarration] = useState('Wallet deposit');
  const [funding, setFunding] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [pendingPaystackUrl, setPendingPaystackUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
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

  const verifyReference = async (ref: string, silent = false) => {
    if (!ref.trim()) return false;
    if (!silent) {
      setError(null);
      setFunding(true);
    }
    try {
      const res = await apiRequest<{
        status: 'pending' | 'successful';
        reference: string;
        amountFormatted: string;
      }>(`/v1/wallets/fund/verify/${encodeURIComponent(ref.trim())}`);

      if (res.data.status !== 'successful') {
        if (!silent) {
          showToast(
            'Payment Still Pending',
            'Paystack has not confirmed this payment yet. Complete checkout or cancel below.',
            'info',
          );
        }
        return false;
      }

      setSuccessMsg(
        `Deposit of ${res.data.amountFormatted} confirmed and added to your balance!`,
      );
      showToast(
        'Wallet Funded',
        `${res.data.amountFormatted} has been credited to your wallet.`,
        'success',
      );
      setPendingPaystackUrl(null);
      setVerifyingRef('');
      await Promise.all([loadWalletAndTxs(), onRefreshUser()]);
      return true;
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Payment verification failed');
      }
      return false;
    } finally {
      if (!silent) {
        setFunding(false);
      }
    }
  };

  useEffect(() => {
    void loadWalletAndTxs();
  }, [liveTick, user.wallet.balanceKobo]);

  // Automatically poll backend Paystack verification while a checkout reference is pending
  useEffect(() => {
    if (!verifyingRef || !pendingPaystackUrl) {
      return;
    }

    const interval = setInterval(async () => {
      const settled = await verifyReference(verifyingRef, true);
      if (settled) {
        clearInterval(interval);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [verifyingRef, pendingPaystackUrl]);

  useEffect(() => {
    const callbackRef = searchParams.get('reference') || searchParams.get('trxref');
    if (callbackRef) {
      setSearchParams({}, { replace: true });
      void verifyReference(callbackRef);
    }
  }, []);

  const handleCopyAccount = () => {
    void navigator.clipboard.writeText(wallet.accountNumber);
    setCopied(true);
    showToast('Account Number Copied', `${wallet.accountNumber} copied to clipboard.`, 'info');
    setTimeout(() => setCopied(false), 2000);
  };

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
          mode: 'paystack',
          callbackUrl: `${window.location.origin}/dashboard`,
        },
      });

      if (res.data.authorizationUrl) {
        setPendingPaystackUrl(res.data.authorizationUrl);
        setVerifyingRef(res.data.reference);
        window.open(res.data.authorizationUrl, '_blank', 'noopener,noreferrer');
        setSuccessMsg(
          'Paystack checkout opened in a new tab. Once you complete payment, click "Confirm Deposit" below.',
        );
      } else {
        setSuccessMsg(`Funded ${res.data.amountFormatted} successfully!`);
        await Promise.all([loadWalletAndTxs(), onRefreshUser()]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start payment');
    } finally {
      setFunding(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setError('Transfer PIN must be 4 digits');
      return;
    }
    setSavingPin(true);
    setError(null);
    try {
      await apiRequest('/v1/users/me/pin', {
        method: 'POST',
        body: { pin: newPin },
      });
      await onRefreshUser();
      setShowPinModal(false);
      setNewPin('');
      setSuccessMsg('Your 4-digit Transfer PIN has been saved.');
      showToast('Transfer PIN Saved', 'Your 4-digit security PIN is now active.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save PIN');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hello, {user.firstName}</h1>
          <p style={{ fontSize: '0.92rem' }}>
            Here is an overview of your NGN wallet and recent activity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowPinModal(true)}
          >
            {user.hasPin ? 'Change Transfer PIN' : 'Set 4-Digit PIN'}
          </button>
          <Link to="/transfers" className="btn btn-teal">
            Send Money &rarr;
          </Link>
        </div>
      </div>

      <div className="wallet-hero-grid">
        <div className="wallet-card">
          <div className="wallet-card-top">
            <div>
              <div className="wallet-card-label">Available Balance</div>
              <div className="wallet-card-balance">{wallet.balanceFormatted}</div>
            </div>
            <span className={`badge badge-${user.status}`}>{user.status}</span>
          </div>

          <div className="wallet-card-bottom">
            <div>
              <div className="wallet-card-label" style={{ marginBottom: '0.2rem' }}>
                Lendsqr Account Number
              </div>
              <div className="account-pill">
                <span className="mono" style={{ color: '#fff', fontSize: '1.05rem' }}>
                  {wallet.accountNumber}
                </span>
                <button type="button" className="copy-btn" onClick={handleCopyAccount}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="wallet-card-label" style={{ marginBottom: '0.2rem' }}>
                Account Holder
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {user.firstName} {user.lastName}
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-label">Transfer Security</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>
              {user.hasPin ? '4-Digit PIN Active' : 'PIN Not Set Yet'}
            </div>
            <p className="stat-sub">
              {user.hasPin
                ? 'Your transfers are protected by your 4-digit security PIN.'
                : 'Set a 4-digit transfer PIN to authorize outgoing payments.'}
            </p>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${user.hasPin ? 'btn-outline' : 'btn-navy'}`}
              onClick={() => setShowPinModal(true)}
            >
              {user.hasPin ? 'Update 4-Digit PIN' : 'Create 4-Digit PIN'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Add Money</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        <form onSubmit={handleFund}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (₦)</label>
              <input
                type="number"
                min="100"
                step="1"
                className="form-input"
                value={amountNaira}
                onChange={(e) => setAmountNaira(e.target.value)}
                required
              />
              <div className="quick-amounts">
                {['1000', '5000', '10000', '25000', '50000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className="chip-btn"
                    onClick={() => setAmountNaira(amt)}
                  >
                    ₦{Number(amt).toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <input
                type="text"
                className="form-input"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="e.g. Personal savings"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-teal" disabled={funding}>
              {funding ? 'Please wait...' : 'Proceed to Paystack'}
            </button>

            {pendingPaystackUrl && (
              <>
                <a
                  href={pendingPaystackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-navy"
                >
                  Open Checkout &rarr;
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void verifyReference(verifyingRef)}
                  disabled={funding}
                >
                  Confirm Deposit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setPendingPaystackUrl(null);
                    setVerifyingRef('');
                    setSuccessMsg(null);
                  }}
                >
                  Cancel Checkout
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent Activity</h2>
          <Link to="/transactions" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            See All &rarr;
          </Link>
        </div>

        {recentTxs.length === 0 ? (
          <p style={{ fontSize: '0.9rem' }}>
            No transactions yet. Add money to your wallet above to get started.
          </p>
        ) : (
          <div className="tx-card-list">
            {recentTxs.map((tx) => (
              <div key={tx.id} className="tx-card-item">
                <div className="tx-card-left">
                  <div className={`tx-icon-circle tx-icon-${tx.direction}`}>
                    {tx.direction === 'outbound' ? '↗' : '↙'}
                  </div>
                  <div className="tx-card-info">
                    <div className="tx-card-title">
                      {tx.narration || (tx.type === 'funding' ? 'Wallet Deposit' : 'Transfer')}
                    </div>
                    <div className="tx-card-sub">
                      {new Date(tx.createdAt).toLocaleString()} &middot; {tx.reference}
                    </div>
                  </div>
                </div>
                <div className="tx-card-right">
                  <div
                    className="tx-card-amount"
                    style={{
                      color: tx.direction === 'outbound' ? 'var(--navy)' : '#188234',
                    }}
                  >
                    {tx.direction === 'outbound' ? '-' : '+'}
                    {tx.amountFormatted}
                  </div>
                  <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPinModal && (
        <div className="modal-backdrop" onClick={() => setShowPinModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="panel-title" style={{ marginBottom: '0.35rem' }}>
              {user.hasPin ? 'Change Your Transfer PIN' : 'Set 4-Digit Transfer PIN'}
            </h3>
            <p style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>
              This 4-digit PIN will be required whenever you send money from your wallet.
            </p>

            <form onSubmit={handleSavePin}>
              <div className="form-group">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  className="form-input pin-input-box"
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowPinModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-teal"
                  disabled={savingPin || newPin.length !== 4}
                >
                  {savingPin ? 'Saving...' : 'Save PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
