import React, { useState } from 'react';
import { apiRequest, UserProfile } from '../api';

interface TransfersPageProps {
  user: UserProfile;
  onRefreshUser: () => Promise<void>;
}

function generateIdempotencyKey(): string {
  return `trf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TransfersPage({ user, onRefreshUser }: TransfersPageProps) {
  const [recipientIdentifier, setRecipientIdentifier] = useState('');
  const [amountNaira, setAmountNaira] = useState('1500');
  const [narration, setNarration] = useState('Wallet transfer');
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    reference: string;
    amountFormatted: string;
    recipient: { name: string; email: string; accountNumber: string };
    sender: { balanceFormatted: string };
    replayed: boolean;
  } | null>(null);

  const executeTransfer = async (keyToUse: string, rotateKeyAfter: boolean) => {
    setError(null);
    const parsedNaira = Number(amountNaira);
    if (Number.isNaN(parsedNaira) || parsedNaira < 100) {
      setError('Minimum transfer amount is ₦100.00');
      return;
    }

    const amountKobo = Math.round(parsedNaira * 100);
    setLoading(true);

    try {
      const res = await apiRequest<{
        reference: string;
        amountFormatted: string;
        recipient: { name: string; email: string; accountNumber: string };
        sender: { balanceFormatted: string };
      }>('/v1/transfers', {
        method: 'POST',
        headers: { 'Idempotency-Key': keyToUse },
        body: {
          recipientIdentifier: recipientIdentifier.trim(),
          amountKobo,
          narration,
        },
      });

      setReceipt({
        ...res.data,
        replayed: res.replayed,
      });

      if (rotateKeyAfter) {
        setIdempotencyKey(generateIdempotencyKey());
      }
      await onRefreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeTransfer(idempotencyKey, false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transfer Money (Wallet A &rarr; Wallet B)</h1>
          <p style={{ fontSize: '0.9rem' }}>
            Your Wallet: <strong>{user.wallet.accountNumber}</strong> &middot; Available Balance:{' '}
            <strong style={{ color: 'var(--navy)' }}>{user.wallet.balanceFormatted}</strong>
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Initiate Atomic Row-Locked Transfer</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {receipt && (
          <div className="alert alert-success">
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              {receipt.replayed
                ? 'Idempotent Replay Returned (X-Idempotent-Replay: true — No Second Debit!)'
                : 'Transfer Completed & Double-Entry Ledger Recorded!'}
            </div>
            <div>
              Reference: <span className="mono">{receipt.reference}</span> &middot; Sent{' '}
              <strong>{receipt.amountFormatted}</strong> to{' '}
              <strong>
                {receipt.recipient.name} ({receipt.recipient.accountNumber})
              </strong>
              . Your new balance: <strong>{receipt.sender.balanceFormatted}</strong>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Recipient Email, 10-Digit Account Number, or Wallet ID
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. chidi@lendsqr.com or 9012345678"
              value={recipientIdentifier}
              onChange={(e) => setRecipientIdentifier(e.target.value)}
              required
            />
          </div>

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
                Sent as <strong>{(Number(amountNaira || 0) * 100).toLocaleString()} kobo</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Idempotency-Key Header</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input mono"
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setIdempotencyKey(generateIdempotencyKey())}
                >
                  New Key
                </button>
              </div>
              <div className="form-hint">
                Click &quot;Send Transfer&quot; twice with the same key to test idempotency replay!
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Narration</label>
            <input
              type="text"
              className="form-input"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="What is this transfer for?"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-teal" disabled={loading}>
              {loading ? 'Executing Row-Locked Transfer...' : 'Send Transfer'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                const fresh = generateIdempotencyKey();
                setIdempotencyKey(fresh);
                void executeTransfer(fresh, true);
              }}
              disabled={loading || !recipientIdentifier.trim()}
            >
              Send with Fresh Idempotency Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
