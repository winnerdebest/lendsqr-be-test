import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { apiRequest, clearToken, getSavedToken, UserProfile } from './api';
import { ConsoleLayout } from './components/ConsoleLayout';
import { ToastProvider, useToast } from './components/ToastProvider';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { TransfersPage } from './pages/TransfersPage';

function AppRoutes() {
  const { showToast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [liveTick, setLiveTick] = useState(0);

  const refreshProfile = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  // Real-time stream listener so balance & incoming transfers update automatically without page refresh
  useEffect(() => {
    const token = getSavedToken();
    if (!user || !token) {
      return;
    }

    const source = new EventSource(
      `/v1/wallets/stream?token=${encodeURIComponent(token)}`,
    );

    source.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as {
          type?: string;
          amountFormatted?: string;
          counterpartyName?: string;
          reference?: string;
        };

        if (data.type === 'transfer_received') {
          showToast(
            'Money Received!',
            `You just received ${data.amountFormatted} from ${data.counterpartyName || 'a Lendsqr user'}.`,
            'success',
          );
          setLiveTick((t) => t + 1);
          void refreshProfile();
        } else if (data.type === 'transfer_sent' || data.type === 'wallet_funded') {
          setLiveTick((t) => t + 1);
          void refreshProfile();
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      source.close();
    };
  }, [user?.id, refreshProfile, showToast]);

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
              <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
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
                <DashboardPage
                  user={user}
                  liveTick={liveTick}
                  onRefreshUser={refreshProfile}
                />
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
                <TransactionsPage liveTick={liveTick} />
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

export function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}
