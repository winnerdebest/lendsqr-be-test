import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearToken, UserProfile } from '../api';

interface ConsoleLayoutProps {
  user: UserProfile | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export function ConsoleLayout({ user, onLogout, children }: ConsoleLayoutProps) {
  const navigate = useNavigate();

  const handleSignOut = () => {
    clearToken();
    onLogout();
    navigate('/login');
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : 'AD';

  return (
    <div className="console-shell">
      <header className="topbar">
        <Link to={user ? '/dashboard' : '/login'} className="logo">
          <span className="logo-mark" />
          <span>lendsqr</span>
        </Link>

        <div className="topbar-right">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            Swagger API Docs
          </a>

          {user ? (
            <>
              <div className="user-chip">
                <div className="avatar">{initials}</div>
                <span>
                  {user.firstName} {user.lastName}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleSignOut}
              >
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-navy btn-sm">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <div className="console-body">
        <aside className="sidebar">
          <div>
            <div className="nav-section-label">Customer Wallet</div>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Dashboard & Fund
            </NavLink>
            <NavLink
              to="/transfers"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Transfer Money
            </NavLink>
            <NavLink
              to="/transactions"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Transactions & Ledger
            </NavLink>

            <div className="nav-section-label" style={{ marginTop: '1rem' }}>
              Back Office
            </div>
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Admin & Blacklist
            </NavLink>
          </div>

          <div style={{ padding: '1rem 1.75rem', fontSize: '0.78rem' }}>
            <a href="/health" target="_blank" rel="noreferrer">
              System Health (/health) &rarr;
            </a>
          </div>
        </aside>

        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
