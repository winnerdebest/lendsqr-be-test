import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AdminTransactionItem,
  apiRequest,
  BlacklistEntry,
  saveToken,
  UserProfile,
} from '../api';
import { useToast } from '../components/ToastProvider';

interface AdminPageProps {
  user: UserProfile | null;
  onAuthSuccess: (user: UserProfile) => void;
}

function formatKobo(kobo: number): string {
  const naira = Math.floor(Math.abs(kobo) / 100);
  const rem = Math.abs(kobo) % 100;
  return `₦${naira.toLocaleString('en-NG')}.${rem.toString().padStart(2, '0')}`;
}

export function AdminPage({ user, onAuthSuccess }: AdminPageProps) {
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'users' | 'transactions' | 'blacklist'>('users');

  // Admin Login Form State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Data State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<AdminTransactionItem[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [newIdentity, setNewIdentity] = useState('');
  const [newReason, setNewReason] = useState('Compliance hold');
  const [loading, setLoading] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [uRes, txRes, bRes] = await Promise.all([
        apiRequest<{ users: UserProfile[] }>('/v1/admin/users'),
        apiRequest<{ transactions: AdminTransactionItem[] }>('/v1/admin/transactions'),
        apiRequest<{ items: BlacklistEntry[] }>('/v1/admin/blacklist'),
      ]);
      setUsers(uRes.data.users);
      setTransactions(txRes.data.transactions);
      setBlacklist(bRes.data.items);
    } catch (err) {
      showToast(
        'Admin Load Error',
        err instanceof Error ? err.message : 'Failed to load admin data',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadAdminData();
    }
  }, [isAdmin]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      const res = await apiRequest<{ accessToken: string; user: UserProfile }>(
        '/v1/auth/login',
        {
          method: 'POST',
          useAuth: false,
          body: { email: adminEmail, password: adminPassword },
        },
      );

      if (res.data.user.role !== 'admin') {
        throw new Error('This account does not have administrator privileges.');
      }

      saveToken(res.data.accessToken);
      onAuthSuccess(res.data.user);
      showToast('Admin Authenticated', 'Welcome to the Lendsqr Administration Console.', 'success');
    } catch (err) {
      showToast(
        'Admin Sign In Failed',
        err instanceof Error ? err.message : 'Admin login failed',
        'error',
      );
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="auth-wrapper">
        <aside className="auth-aside">
          <div className="logo">
            <span className="logo-mark" />
            <span>lendsqr</span>
          </div>

          <div className="auth-hero-box">
            <h2>Back-Office Administration & Compliance Console.</h2>
            <p>
              Monitor customer wallets, audit platform transactions in real time, freeze
              or restore accounts, and manage blacklisted identities.
            </p>
            <div className="feature-pills">
              <div className="feature-pill">
                <span className="feature-dot" />
                <span>Customer directory with instant account block & unblock controls</span>
              </div>
              <div className="feature-pill">
                <span className="feature-dot" />
                <span>Read-only audit ledger of all platform deposits & transfers</span>
              </div>
              <div className="feature-pill">
                <span className="feature-dot" />
                <span>Real-time blacklist management integrated with Adjutor Karma</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
            &copy; {new Date().getFullYear()} Lendsqr Back-Office Console
          </div>
        </aside>

        <main className="auth-main">
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="badge badge-pending">Administrator Access</span>
          </div>
          <h1 className="auth-title">Admin Sign In</h1>
          <p className="auth-subtitle">
            Enter your Lendsqr administrator credentials to access the console.
          </p>

          <form onSubmit={handleAdminLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter admin email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter admin password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-teal btn-block"
              style={{ marginTop: '0.5rem' }}
              disabled={authLoading}
            >
              {authLoading ? 'Signing in...' : 'Sign In to Admin Console'}
            </button>
          </form>

          <p style={{ marginTop: '1.5rem', fontSize: '0.92rem' }}>
            Looking for the customer wallet portal?{' '}
            <Link to="/login" style={{ fontWeight: 600 }}>
              Customer Sign In &rarr;
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const handleToggleUserStatus = async (u: UserProfile) => {
    const action = u.status === 'active' ? 'block' : 'unblock';
    const reason =
      action === 'block'
        ? 'Account frozen by administrator'
        : 'Account restored by administrator';

    try {
      await apiRequest(`/v1/admin/users/${u.id}/${action}`, {
        method: 'PATCH',
        body: { reason },
      });
      showToast(
        action === 'block' ? 'Account Blocked' : 'Account Restored',
        `Customer ${u.firstName} ${u.lastName} has been ${
          action === 'block' ? 'blocked' : 'unblocked'
        }.`,
        'success',
      );
      await loadAdminData();
    } catch (err) {
      showToast(
        'Action Failed',
        err instanceof Error ? err.message : `Failed to ${action} user`,
        'error',
      );
    }
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/v1/admin/blacklist', {
        method: 'POST',
        body: { identity: newIdentity.trim(), reason: newReason.trim() },
      });
      showToast('Identity Blacklisted', `Added '${newIdentity.trim()}' to the blacklist.`, 'success');
      setNewIdentity('');
      await loadAdminData();
    } catch (err) {
      showToast(
        'Blacklist Failed',
        err instanceof Error ? err.message : 'Failed to add to blacklist',
        'error',
      );
    }
  };

  const handleRemoveBlacklist = async (identity: string) => {
    try {
      await apiRequest(`/v1/admin/blacklist/${encodeURIComponent(identity)}`, {
        method: 'DELETE',
      });
      showToast('Identity Removed', `Removed '${identity}' from the blacklist.`, 'info');
      await loadAdminData();
    } catch (err) {
      showToast(
        'Remove Failed',
        err instanceof Error ? err.message : 'Failed to remove identity',
        'error',
      );
    }
  };

  const customerUsers = users.filter((u) => u.role !== 'admin');
  const customerCount = customerUsers.length;
  const activeCount = customerUsers.filter((u) => u.status === 'active').length;
  const blockedCount = customerUsers.filter((u) => u.status === 'blocked').length;

  // Cashflow & Liquidity Calculations (in kobo)
  const successfulTxs = transactions.filter((t) => t.status === 'successful');
  const totalDepositsKobo = successfulTxs
    .filter((t) => t.type === 'funding')
    .reduce((sum, t) => sum + t.amountKobo, 0);
  const totalTransfersKobo = successfulTxs
    .filter((t) => t.type === 'transfer')
    .reduce((sum, t) => sum + t.amountKobo, 0);
  const totalCashflowKobo = totalDepositsKobo + totalTransfersKobo;
  const totalWalletFloatKobo = customerUsers.reduce(
    (sum, u) => sum + (u.wallet?.balanceKobo || 0),
    0,
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Cashflow & Administration</h1>
          <p style={{ fontSize: '0.92rem' }}>
            Real-time overview of total money movement, customer wallets, and compliance controls.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void loadAdminData()}
        >
          Refresh Metrics
        </button>
      </div>

      <div className="wallet-hero-grid">
        <div className="wallet-card">
          <div className="wallet-card-top">
            <div>
              <div className="wallet-card-label">Total Platform Cashflow Processed</div>
              <div className="wallet-card-balance">{formatKobo(totalCashflowKobo)}</div>
            </div>
            <span className="badge badge-active">
              {successfulTxs.length} Settled Transactions
            </span>
          </div>

          <div className="wallet-card-bottom">
            <div>
              <div className="wallet-card-label" style={{ marginBottom: '0.2rem' }}>
                Total Deposits (Inflow)
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--teal)' }}>
                {formatKobo(totalDepositsKobo)}
              </div>
            </div>

            <div>
              <div className="wallet-card-label" style={{ marginBottom: '0.2rem' }}>
                Peer-to-Peer Transfers
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
                {formatKobo(totalTransfersKobo)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="wallet-card-label" style={{ marginBottom: '0.2rem' }}>
                Customer Wallet Float Held
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
                {formatKobo(totalWalletFloatKobo)}
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-label">Customer Accounts & Compliance</div>
            <div className="stat-value" style={{ marginBottom: '0.35rem' }}>
              {customerCount} Customers
            </div>
            <p className="stat-sub">
              <strong>{activeCount}</strong> active &middot;{' '}
              <strong style={{ color: blockedCount > 0 ? 'var(--danger)' : 'inherit' }}>
                {blockedCount}
              </strong>{' '}
              blocked &middot; <strong>{blacklist.length}</strong> blacklisted identities
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setActiveTab('users')}
            >
              Manage Customers
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setActiveTab('blacklist')}
            >
              Manage Blacklist
            </button>
          </div>
        </div>
      </div>

      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Customers ({customerCount})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          All Transactions ({transactions.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'blacklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('blacklist')}
        >
          Blacklist ({blacklist.length})
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Customer Accounts</h2>
          </div>

          {loading ? (
            <p>Loading customers...</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Account No.</th>
                    <th>Wallet Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customerUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                        {u.firstName} {u.lastName}
                      </td>
                      <td>{u.email}</td>
                      <td>{u.phone}</td>
                      <td className="mono">{u.wallet.accountNumber}</td>
                      <td style={{ fontWeight: 600 }}>{u.wallet.balanceFormatted}</td>
                      <td>
                        <span className={`badge badge-${u.status}`}>{u.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            u.status === 'active' ? 'btn-danger' : 'btn-success'
                          }`}
                          onClick={() => void handleToggleUserStatus(u)}
                        >
                          {u.status === 'active' ? 'Block' : 'Unblock'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">All Platform Transactions (Read-Only)</h2>
          </div>

          {transactions.length === 0 ? (
            <p>No transactions recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Sender</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="mono">{tx.reference}</td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {tx.type === 'funding' ? 'Deposit' : 'Transfer'}
                      </td>
                      <td>
                        {tx.metadata?.senderEmail ||
                          tx.metadata?.senderAccountNumber ||
                          (tx.type === 'funding' ? 'Paystack' : '—')}
                      </td>
                      <td>
                        {tx.metadata?.recipientEmail ||
                          tx.metadata?.recipientAccountNumber ||
                          'Customer Wallet'}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--navy)' }}>
                        {tx.amountFormatted}
                      </td>
                      <td>{tx.narration || '—'}</td>
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
      )}

      {activeTab === 'blacklist' && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Blacklisted Identities</h2>
          </div>

          <form onSubmit={handleAddBlacklist} style={{ marginBottom: '1.5rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email or Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter email or phone number to block"
                  value={newIdentity}
                  onChange={(e) => setNewIdentity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn-teal">
                    Add
                  </button>
                </div>
              </div>
            </div>
          </form>

          {blacklist.length === 0 ? (
            <p style={{ fontSize: '0.9rem' }}>No blacklisted identities yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Source</th>
                    <th>Reason</th>
                    <th>Date Added</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklist.map((b) => (
                    <tr key={b.id}>
                      <td className="mono">{b.identity}</td>
                      <td>
                        <span className="badge badge-pending">{b.source}</span>
                      </td>
                      <td>{b.reason}</td>
                      <td>{new Date(b.created_at).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void handleRemoveBlacklist(b.identity)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
