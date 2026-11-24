import React, { createContext, useCallback, useContext, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (title: string, message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, message: string, kind: ToastKind = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, title, message, kind }]);
      setTimeout(() => {
        dismiss(id);
      }, 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card toast-${t.kind}`}>
            <div className="toast-icon">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}
            </div>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              <div className="toast-msg">{t.message}</div>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Close notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
