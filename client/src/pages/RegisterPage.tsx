import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, saveToken, UserProfile } from '../api';

interface RegisterPageProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export function RegisterPage({ onAuthSuccess }: RegisterPageProps) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest<{ accessToken: string; user: UserProfile }>(
        '/v1/auth/register',
        {
          method: 'POST',
          useAuth: false,
          body: { firstName, lastName, email, phone, password },
        },
      );
      saveToken(res.data.accessToken);
      onAuthSuccess(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <h2>Instant NGN Wallet Onboarding.</h2>
          <p>
            Every new customer is automatically screened against our local compliance list and
            the Lendsqr Adjutor Karma API before an NGN wallet and 10-digit account number are
            provisioned.
          </p>
          <div className="feature-pills">
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>
                <strong>Karma Blacklist Check:</strong> Screens email & phone at signup
              </span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>
                <strong>Atomic Provisioning:</strong> User + NGN wallet created in one transaction
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
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">
          Register to verify Karma status and open your NGN wallet.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ada"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Obi"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

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
            <label className="form-label">Phone Number</label>
            <input
              type="tel"
              className="form-input"
              placeholder="+2348012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <div className="form-hint">10 to 15 digits (e.g. +2348012345678)</div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-teal btn-block"
            style={{ marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Verifying Karma & Creating Wallet...' : 'Create Wallet Account'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Log In
          </Link>
        </p>
      </main>
    </div>
  );
}
