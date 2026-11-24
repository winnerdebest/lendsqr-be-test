import React, { useEffect, useState } from 'react';
import { apiRequest, TransactionDetail, TransactionItem } from '../api';

export function TransactionsPage({ liveTick = 0 }: { liveTick?: number }) {
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedTx, setSelectedTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = async (typeVal = typeFilter) => {
    setLoading(true);
    setError(null);
    try {
      const query = typeVal ? `?type=${encodeURIComponent(typeVal)}&limit=50` : '?limit=50';
      const res = await apiRequest<{ items: TransactionItem[] }>(`/v1/transactions${query}`);
      setItems(res.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [liveTick]);

  const handleViewReceipt = async (reference: string) => {
    setError(null);
    try {
      const res = await apiRequest<TransactionDetail>(
        `/v1/transactions/${encodeURIComponent(reference)}`,
      );
      setSelectedTx(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transaction receipt');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p style={{ fontSize: '0.92rem' }}>
            View all deposits and transfers on your wallet.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <select
            className="form-input"
            style={{ width: '180px', padding: '0.55rem 0.85rem' }}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              void loadTransactions(e.target.value);
            }}
          >
            <option value="">All Transactions</option>
            <option value="funding">Deposits Only</option>
            <option value="transfer">Transfers Only</option>
          </select>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void loadTransactions()}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Transaction History ({items.length})</h2>
        </div>

        {loading ? (
          <p>Loading transactions...</p>
        ) : items.length === 0 ? (
          <p>No transactions found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {tx.narration || (tx.type === 'funding' ? 'Wallet Deposit' : 'Transfer')}
                    </td>
                    <td className="mono">{tx.reference}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {tx.type === 'funding' ? 'Deposit' : 'Transfer'}
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: tx.direction === 'outbound' ? 'var(--navy)' : '#188234',
                      }}
                    >
                      {tx.direction === 'outbound' ? '-' : '+'}
                      {tx.amountFormatted}
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                    </td>
                    <td>{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => void handleViewReceipt(tx.reference)}
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTx && (
        <div className="modal-backdrop" onClick={() => setSelectedTx(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 className="panel-title">Transaction Receipt</h3>
              <span className={`badge badge-${selectedTx.status}`}>{selectedTx.status}</span>
            </div>

            <div
              style={{
                textAlign: 'center',
                padding: '1.1rem',
                background: 'var(--bg)',
                borderRadius: '10px',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>Amount</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--navy)' }}>
                {selectedTx.direction === 'outbound' ? '-' : '+'}
                {selectedTx.amountFormatted}
              </div>
            </div>

            <div style={{ fontSize: '0.88rem', display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Reference</span>
                <strong className="mono">{selectedTx.reference}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Type</span>
                <strong style={{ textTransform: 'capitalize' }}>{selectedTx.type}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Description</span>
                <strong>{selectedTx.narration || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Date & Time</span>
                <strong>{new Date(selectedTx.createdAt).toLocaleString()}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-navy btn-block"
              style={{ marginTop: '1.5rem' }}
              onClick={() => setSelectedTx(null)}
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
