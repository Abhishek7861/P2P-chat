import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, tokenStore } from '../services/api';
import type { User } from '../services/api';

type AuthCtx = {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => void;
};

type AuthResponse = { token: string; user: User };

const Ctx = createContext<AuthCtx>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // With no stored token there is nothing to restore, so we're ready immediately.
  const [ready, setReady] = useState(() => !tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<User>('/users/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const accept = (r: AuthResponse) => {
    tokenStore.set(r.token);
    setUser(r.user);
  };

  const value: AuthCtx = {
    user,
    ready,
    login: async (username, password) =>
      accept(
        await api<AuthResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }),
      ),
    register: async (username, displayName, password) =>
      accept(
        await api<AuthResponse>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, displayName, password }),
        }),
      ),
    logout: () => {
      tokenStore.clear();
      setUser(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
