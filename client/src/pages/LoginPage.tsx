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
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
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
          <h2>Fast, secure & reliable payments for everyday life.</h2>
          <p>
            Fund your NGN wallet in seconds, send money seamlessly to any Lendsqr account,
            and track every payment in real time.
          </p>
          <div className="feature-pills">
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>Instant transfers to any Lendsqr account number or email</span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>4-digit Transfer PIN security on every outgoing payment</span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>Seamless card & bank funding powered by Paystack</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
          &copy; {new Date().getFullYear()} Lendsqr Wallet
        </div>
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Welcome!</h1>
        <p className="auth-subtitle">Enter your details to sign in to your wallet.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="name@example.com"
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
            {loading ? 'Signing in...' : 'Log In'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.92rem' }}>
          New to Lendsqr Wallet?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Create an Account
          </Link>
        </p>
      </main>
    </div>
  );
}
