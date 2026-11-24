import React, { useEffect, useState } from 'react';
import {
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

  // Admin Login Form State (shown when user is not logged in as admin)
  const [adminEmail, setAdminEmail] = useState('admin@lendsqr.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Data State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [newIdentity, setNewIdentity] = useState('');
  const [newReason, setNewReason] = useState('Confirmed compliance violation');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, bRes] = await Promise.all([
        apiRequest<{ users: UserProfile[] }>('/v1/admin/users'),
        apiRequest<{ items: BlacklistEntry[] }>('/v1/admin/blacklist'),
      ]);
      setUsers(uRes.data.users);
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
        throw new Error('This account does not have admin privileges.');
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
      <div style={{ maxWidth: '480px', margin: '2rem auto' }}>
        <div className="panel">
          <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>
            Back-Office Admin Login
          </h1>
          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Sign in with your Lendsqr administrator email and password to manage accounts
            and the blacklist.
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
              <label className="form-label">Admin Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter admin password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
              <div className="form-hint">
                Default seeded admin: <span className="mono">admin@lendsqr.com</span> /{' '}
                <span className="mono">AdminPassword123!</span>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-teal btn-block"
              disabled={authLoading}
            >
              {authLoading ? 'Signing in...' : 'Sign In as Admin'}
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
        ? 'Account frozen by admin compliance review'
        : 'Account cleared and restored by admin';

    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest(`/v1/admin/users/${u.id}/${action}`, {
        method: 'PATCH',
        body: { reason },
      });
      setSuccessMsg(
        `User ${u.email} has been ${action === 'block' ? 'blocked' : 'unblocked'}.`,
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
      setSuccessMsg(`Removed '${identity}' from the local blacklist.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove identity');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Back-Office Admin & Blacklist Console</h1>
          <p style={{ fontSize: '0.9rem' }}>
            Signed in as Administrator (<strong>{user.email}</strong>). Block or unblock
            accounts and manage blacklisted identities.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void loadAdminData()}
        >
          Refresh Data
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Registered Accounts ({users.length})</h2>
        </div>

        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users registered yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account No.</th>
                  <th>Balance</th>
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
                    <td>
                      <span className="badge badge-pending">{u.role}</span>
                    </td>
                    <td className="mono">{u.wallet.accountNumber}</td>
                    <td style={{ fontWeight: 600 }}>{u.wallet.balanceFormatted}</td>
                    <td>
                      <span className={`badge badge-${u.status}`}>{u.status}</span>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>
                          Protected
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            u.status === 'active' ? 'btn-danger' : 'btn-success'
                          }`}
                          onClick={() => void handleToggleUserStatus(u)}
                        >
                          {u.status === 'active' ? 'Block Account' : 'Unblock Account'}
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

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Blacklist Management (Local DB + Cached Karma Hits)</h2>
        </div>

        <form onSubmit={handleAddBlacklist} style={{ marginBottom: '1.5rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Identity to Blacklist (Email or Phone)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. fraudster@badactor.com or +2348099998888"
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
                  Blacklist
                </button>
              </div>
            </div>
          </div>
        </form>

        {blacklist.length === 0 ? (
          <p style={{ fontSize: '0.9rem' }}>No identities in the local blacklist table yet.</p>
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
    </div>
  );
}
