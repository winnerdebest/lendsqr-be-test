import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, saveToken, UserProfile } from '../api';

interface LoginPageProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onAuthSuccess }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest<{ accessToken: string; user: UserProfile }>(
        '/v1/auth/login',
        {
          method: 'POST',
          useAuth: false,
          body: { email, password },
        },
      );
      saveToken(res.data.accessToken);
      onAuthSuccess(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <aside className="auth-aside">
        <div className="logo">
          <span className="logo-mark" />
          <span>lendsqr</span>
        </div>

        <div className="auth-hero-box">
          <h2>Accurate, safe & always available money movement.</h2>
          <p>
            Wallet service engineered with double-entry ledger reconciliation, pessimistic
            row-level locking, idempotency replay protection, and Adjutor Karma screening.
          </p>
          <div className="feature-pills">
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>
                <strong>Row-Locked Concurrency:</strong> Zero double-spend under parallel requests
              </span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>
                <strong>Double-Entry Ledger:</strong> Every kobo reconciled across debit & credit
              </span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>
                <strong>Lendsqr Karma & Paystack:</strong> Live blacklist screening & funding
              </span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.84rem', display: 'flex', gap: '1.25rem' }}>
          <Link to="/admin">Open Back-Office Admin Console &rarr;</Link>
          <a href="/docs" target="_blank" rel="noreferrer">
            Swagger API Docs &rarr;
          </a>
        </div>
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Welcome!</h1>
        <p className="auth-subtitle">Enter details to login to your Lendsqr wallet.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="ada.obi@lendsqr.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-teal btn-block"
            style={{ marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
          Don&apos;t have a wallet account yet?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Create an Account
          </Link>
        </p>
      </main>
    </div>
  );
}
