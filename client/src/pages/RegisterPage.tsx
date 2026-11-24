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
          <h2>Open your NGN wallet in under a minute.</h2>
          <p>
            Get a dedicated 10-digit account number immediately upon signup to fund, send,
            and receive money effortlessly.
          </p>
          <div className="feature-pills">
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>Dedicated 10-digit NGN wallet account number</span>
            </div>
            <div className="feature-pill">
              <span className="feature-dot" />
              <span>Zero maintenance fees & instant transfers</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
          &copy; {new Date().getFullYear()} Lendsqr Wallet
        </div>
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Enter your personal details to open your wallet.</p>

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
              placeholder="name@example.com"
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
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="At least 8 characters"
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
            {loading ? 'Creating Wallet...' : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.92rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Log In
          </Link>
        </p>
      </main>
    </div>
  );
}
