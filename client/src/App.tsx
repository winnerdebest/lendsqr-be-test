import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { apiRequest, clearToken, getSavedToken, UserProfile } from './api';
import { ConsoleLayout } from './components/ConsoleLayout';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { TransfersPage } from './pages/TransfersPage';

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const refreshProfile = async () => {
    const token = getSavedToken();
    if (!token) {
      setUser(null);
      setCheckingAuth(false);
      return;
    }

    try {
      const res = await apiRequest<UserProfile>('/v1/users/me');
      setUser(res.data);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    void refreshProfile();
  }, []);

  if (checkingAuth) {
    return null;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onAuthSuccess={(u) => setUser(u)} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <RegisterPage onAuthSuccess={(u) => setUser(u)} />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            user ? (
              <ConsoleLayout user={user} onLogout={() => setUser(null)}>
                <DashboardPage user={user} onRefreshUser={refreshProfile} />
              </ConsoleLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/transfers"
          element={
            user ? (
              <ConsoleLayout user={user} onLogout={() => setUser(null)}>
                <TransfersPage user={user} onRefreshUser={refreshProfile} />
              </ConsoleLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/transactions"
          element={
            user ? (
              <ConsoleLayout user={user} onLogout={() => setUser(null)}>
                <TransactionsPage />
              </ConsoleLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            <ConsoleLayout user={user} onLogout={() => setUser(null)}>
              <AdminPage user={user} onAuthSuccess={(u) => setUser(u)} />
            </ConsoleLayout>
          }
        />
        <Route
          path="*"
          element={<Navigate to={user ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
