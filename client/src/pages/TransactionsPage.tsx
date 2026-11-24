import React, { useEffect, useState } from 'react';
import { apiRequest, TransactionDetail, TransactionItem } from '../api';

export function TransactionsPage() {
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
  }, []);

  const handleInspectLedger = async (reference: string) => {
    setError(null);
    try {
      const res = await apiRequest<TransactionDetail>(
        `/v1/transactions/${encodeURIComponent(reference)}`,
      );
      setSelectedTx(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger entries');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions & Double-Entry Ledger</h1>
          <p style={{ fontSize: '0.9rem' }}>
            Click any transaction to inspect its underlying debit and credit ledger entries.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <select
            className="form-input"
            style={{ width: '180px', padding: '0.5rem 0.75rem' }}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              void loadTransactions(e.target.value);
            }}
          >
            <option value="">All Types</option>
            <option value="funding">Funding Only</option>
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

      {selectedTx && (
        <div className="panel" style={{ borderColor: 'var(--teal)' }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                Double-Entry Ledger Breakdown:{' '}
                <span className="mono">{selectedTx.reference}</span>
              </h2>
              <p style={{ fontSize: '0.84rem' }}>
                Type: <strong>{selectedTx.type}</strong> &middot; Amount:{' '}
                <strong>{selectedTx.amountFormatted}</strong> &middot; Narration:{' '}
                {selectedTx.narration || '—'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSelectedTx(null)}
            >
              Close
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ledger Entry ID</th>
                  <th>Wallet ID</th>
                  <th>Direction</th>
                  <th>Amount (Kobo)</th>
                  <th>Balance Before (Kobo)</th>
                  <th>Balance After (Kobo)</th>
                </tr>
              </thead>
              <tbody>
                {selectedTx.ledgerEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.id.slice(0, 8)}...</td>
                    <td className="mono">{entry.walletId.slice(0, 8)}...</td>
                    <td>
                      <span className={`badge badge-${entry.direction}`}>
                        {entry.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="mono">
                      {entry.amountFormatted} ({entry.amountKobo.toLocaleString()})
                    </td>
                    <td className="mono">{entry.balanceBeforeKobo.toLocaleString()}</td>
                    <td className="mono">{entry.balanceAfterKobo.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Amount</th>
                  <th>Narration</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Ledger</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
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
                    <td>{tx.narration || '—'}</td>
                    <td>
                      <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                    </td>
                    <td>{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => void handleInspectLedger(tx.reference)}
                      >
                        Inspect Ledger
                      </button>
                    </td>
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
