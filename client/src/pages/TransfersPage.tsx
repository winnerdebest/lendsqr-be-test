import React, { useEffect, useState } from 'react';
import { apiRequest, UserProfile } from '../api';
import { useToast } from '../components/ToastProvider';

interface TransfersPageProps {
  user: UserProfile;
  onRefreshUser: () => Promise<void>;
}

interface ResolvedRecipient {
  accountName: string;
  accountNumber: string;
  email: string;
  isSelf: boolean;
}

function generateIdempotencyKey(): string {
  return `trf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TransfersPage({ user, onRefreshUser }: TransfersPageProps) {
  const { showToast } = useToast();
  const [recipientIdentifier, setRecipientIdentifier] = useState('');
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [amountNaira, setAmountNaira] = useState('');
  const [narration, setNarration] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    reference: string;
    amountFormatted: string;
    recipient: { name: string; email: string; accountNumber: string };
    sender: { balanceFormatted: string };
  } | null>(null);

  // Automatic Name Inquiry as user enters 10-digit account number or email
  useEffect(() => {
    const clean = recipientIdentifier.trim();
    const looksLikeAccountOrEmail =
      /^\d{10}$/.test(clean) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);

    if (!looksLikeAccountOrEmail) {
      setResolvedRecipient(null);
      setResolveError(null);
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<ResolvedRecipient>(
          `/v1/wallets/resolve?identifier=${encodeURIComponent(clean)}`,
        );
        if (cancelled) return;
        if (res.data.isSelf) {
          setResolvedRecipient(null);
          setResolveError('You cannot transfer money to your own wallet');
        } else {
          setResolvedRecipient(res.data);
          setResolveError(null);
        }
      } catch {
        if (!cancelled) {
          setResolvedRecipient(null);
          setResolveError('No Lendsqr wallet found for this account number or email');
        }
      } finally {
        if (!cancelled) {
          setResolving(false);
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recipientIdentifier]);

  const handleOpenConfirmModal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setReceipt(null);

    if (!resolvedRecipient) {
      setError(resolveError || 'Please enter a valid recipient account number or email');
      return;
    }

    const parsedNaira = Number(amountNaira);
    if (Number.isNaN(parsedNaira) || parsedNaira < 100) {
      setError('Minimum transfer amount is ₦100.00');
      return;
    }

    if (parsedNaira * 100 > user.wallet.balanceKobo) {
      setError(
        `Insufficient balance. Your available balance is ${user.wallet.balanceFormatted}.`,
      );
      return;
    }

    setPin('');
    setShowPinModal(true);
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError('Please enter your 4-digit transfer PIN');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!user.hasPin) {
        await apiRequest('/v1/users/me/pin', {
          method: 'POST',
          body: { pin },
        });
      }

      const amountKobo = Math.round(Number(amountNaira) * 100);
      const res = await apiRequest<{
        reference: string;
        amountFormatted: string;
        recipient: { name: string; email: string; accountNumber: string };
        sender: { balanceFormatted: string };
      }>('/v1/transfers', {
        method: 'POST',
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
        body: {
          recipientIdentifier: recipientIdentifier.trim(),
          amountKobo,
          narration: narration.trim() || 'Wallet transfer',
          pin,
        },
      });

      setShowPinModal(false);
      setReceipt(res.data);
      showToast(
        'Transfer Successful',
        `Sent ${res.data.amountFormatted} to ${res.data.recipient.name} (${res.data.recipient.accountNumber}).`,
        'success',
      );
      setRecipientIdentifier('');
      setResolvedRecipient(null);
      setAmountNaira('');
      setNarration('');
      setPin('');
      await onRefreshUser();
    } catch (err) {
      setShowPinModal(false);
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      setError(msg);
      showToast('Transfer Failed', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Send Money</h1>
          <p style={{ fontSize: '0.92rem' }}>
            Transfer funds instantly to any Lendsqr account number or email address.
          </p>
        </div>
        <div className="stat-card" style={{ padding: '0.75rem 1.25rem' }}>
          <div className="stat-label" style={{ marginBottom: '0.15rem' }}>
            Available Balance
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--navy)' }}>
            {user.wallet.balanceFormatted}
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: '680px' }}>
        <div className="panel-header">
          <h2 className="panel-title">Transfer Details</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {receipt && (
          <div className="alert alert-success">
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              Transfer Successful!
            </div>
            <div>
              You sent <strong>{receipt.amountFormatted}</strong> to{' '}
              <strong>
                {receipt.recipient.name} ({receipt.recipient.accountNumber})
              </strong>
              . Reference: <span className="mono">{receipt.reference}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleOpenConfirmModal}>
          <div className="form-group">
            <label className="form-label">Recipient Account Number or Email</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter 10-digit account number (e.g. 9012345678) or email"
              value={recipientIdentifier}
              onChange={(e) => setRecipientIdentifier(e.target.value)}
              required
            />

            {resolving && (
              <div className="recipient-lookup-card recipient-checking">
                <span>Verifying account name...</span>
              </div>
            )}

            {!resolving && resolvedRecipient && (
              <div className="recipient-lookup-card recipient-verified">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    ✓ {resolvedRecipient.accountName}
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                    Account No: {resolvedRecipient.accountNumber} &middot;{' '}
                    {resolvedRecipient.email}
                  </div>
                </div>
                <span className="badge badge-active">Verified</span>
              </div>
            )}

            {!resolving && resolveError && (
              <div className="recipient-lookup-card recipient-error">
                <span>{resolveError}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Amount (₦)</label>
            <input
              type="number"
              min="100"
              step="1"
              className="form-input"
              placeholder="0.00"
              value={amountNaira}
              onChange={(e) => setAmountNaira(e.target.value)}
              required
            />
            <div className="quick-amounts">
              {['1000', '2500', '5000', '10000', '20000'].map((amt) => (
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
            <label className="form-label">Note / Description (Optional)</label>
            <input
              type="text"
              className="form-input"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="What is this payment for?"
            />
          </div>

          <button
            type="submit"
            className="btn btn-teal btn-block"
            style={{ marginTop: '0.5rem' }}
            disabled={loading || resolving || !resolvedRecipient}
          >
            {resolvedRecipient
              ? `Continue to Pay ${resolvedRecipient.accountName}`
              : 'Continue'}
          </button>
        </form>
      </div>

      {showPinModal && resolvedRecipient && (
        <div className="modal-backdrop" onClick={() => setShowPinModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="panel-title" style={{ marginBottom: '0.35rem' }}>
              {user.hasPin ? 'Enter Transfer PIN' : 'Create & Confirm 4-Digit Transfer PIN'}
            </h3>
            <p style={{ fontSize: '0.88rem', marginBottom: '1rem' }}>
              Authorize sending{' '}
              <strong style={{ color: 'var(--navy)' }}>
                ₦{Number(amountNaira).toLocaleString()}
              </strong>{' '}
              to{' '}
              <strong style={{ color: 'var(--navy)' }}>
                {resolvedRecipient.accountName} ({resolvedRecipient.accountNumber})
              </strong>
              .
            </p>

            <form onSubmit={handleConfirmTransfer}>
              <div className="form-group">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  className="form-input pin-input-box"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
                  disabled={loading || pin.length !== 4}
                >
                  {loading ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
