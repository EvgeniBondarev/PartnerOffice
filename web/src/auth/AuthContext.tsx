import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';
import type { PartnerProfile } from '../api/auth';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: Status;
  partner: PartnerProfile | null;
  /** Входит по логину и паролю. При ошибке бросает ApiError: 401 — неверные данные, 429 — временная блокировка. */
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [partner, setPartner] = useState<PartnerProfile | null>(null);

  // При открытии приложения выясняем, жива ли сессия: cookie браузер хранит сам.
  useEffect(() => {
    let cancelled = false;
    authApi
      .fetchMe()
      .then((me) => {
        if (cancelled) return;
        setPartner(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setPartner(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (login: string, password: string) => {
    await authApi.login(login, password);
    // Профиль берём отдельным запросом: в нём есть возможности партнёра.
    const me = await authApi.fetchMe();
    setPartner(me);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Сессия уже могла истечь: тогда выходить не из чего, а локально выйти всё равно нужно.
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    setPartner(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(() => ({ status, partner, signIn, signOut }), [status, partner, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth нужно вызывать внутри AuthProvider');
  return context;
}
