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
    : 'LS';

  return (
    <div className="console-shell">
      <header className="topbar">
        <Link to={user ? '/dashboard' : '/login'} className="logo">
          <span className="logo-mark" />
          <span>lendsqr</span>
        </Link>

        <div className="topbar-right">
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
            <div className="nav-section-label">Wallet Menu</div>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/transfers"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Transfers
            </NavLink>
            <NavLink
              to="/transactions"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Transactions
            </NavLink>

            {user?.role === 'admin' && (
              <>
                <div className="nav-section-label" style={{ marginTop: '1rem' }}>
                  Administration
                </div>
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  User & Blacklist Console
                </NavLink>
              </>
            )}
          </div>
        </aside>

        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
