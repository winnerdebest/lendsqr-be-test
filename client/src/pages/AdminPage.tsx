import React, { useEffect, useState } from 'react';
import {
  AdminTransactionItem,
  apiRequest,
  BlacklistEntry,
  saveToken,
  UserProfile,
} from '../api';

interface AdminPageProps {
  user: UserProfile | null;
  onAuthSuccess: (user: UserProfile) => void;
}

export function AdminPage({ user, onAuthSuccess }: AdminPageProps) {
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'users' | 'transactions' | 'blacklist'>('users');

  // Admin Login Form State
  const [adminEmail, setAdminEmail] = useState('admin@lendsqr.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Data State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<AdminTransactionItem[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [newIdentity, setNewIdentity] = useState('');
  const [newReason, setNewReason] = useState('Compliance hold');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
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
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: '460px', margin: '2.5rem auto' }}>
        <div className="panel">
          <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>
            Admin Portal Sign In
          </h1>
          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Sign in with your Lendsqr administrator credentials to view customers,
            transactions, and compliance controls.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleAdminLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-input"
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
              disabled={authLoading}
            >
              {authLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleToggleUserStatus = async (u: UserProfile) => {
    const action = u.status === 'active' ? 'block' : 'unblock';
    const reason =
      action === 'block'
        ? 'Account frozen by administrator'
        : 'Account restored by administrator';

    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/v1/admin/users/${u.id}/${action}`, {
        method: 'PATCH',
        body: { reason },
      });
      setSuccessMsg(
        `Customer ${u.firstName} ${u.lastName} has been ${
          action === 'block' ? 'blocked' : 'unblocked'
        }.`,
      );
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} user`);
    }
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/v1/admin/blacklist', {
        method: 'POST',
        body: { identity: newIdentity.trim(), reason: newReason.trim() },
      });
      setSuccessMsg(`Added '${newIdentity.trim()}' to the blacklist.`);
      setNewIdentity('');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to blacklist');
    }
  };

  const handleRemoveBlacklist = async (identity: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/v1/admin/blacklist/${encodeURIComponent(identity)}`, {
        method: 'DELETE',
      });
      setSuccessMsg(`Removed '${identity}' from the blacklist.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove identity');
    }
  };

  const customerCount = users.filter((u) => u.role !== 'admin').length;
  const activeCount = users.filter((u) => u.role !== 'admin' && u.status === 'active').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration Console</h1>
          <p style={{ fontSize: '0.92rem' }}>
            Manage customer accounts, view platform transactions, and update the blacklist.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void loadAdminData()}
        >
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Customers</div>
          <div className="stat-value">{customerCount}</div>
          <div className="stat-sub">{activeCount} active accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{transactions.length}</div>
          <div className="stat-sub">Read-only platform audit view</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Blacklisted Identities</div>
          <div className="stat-value">{blacklist.length}</div>
          <div className="stat-sub">Blocked from onboarding</div>
        </div>
      </div>

      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Customers ({users.length})
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

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

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
                  {users.map((u) => (
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
                        {u.role === 'admin' ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>
                            Admin
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              u.status === 'active' ? 'btn-danger' : 'btn-success'
                            }`}
                            onClick={() => void handleToggleUserStatus(u)}
                          >
                            {u.status === 'active' ? 'Block' : 'Unblock'}
                          </button>
                        )}
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
