import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SignalingClient } from '../services/signaling';
import type { SignalingStatus } from '../services/signaling';
import { tokenStore } from '../services/api';

type SignalingCtx = { client: SignalingClient; online: Set<string>; status: SignalingStatus };

const Ctx = createContext<SignalingCtx>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export const useSignaling = () => useContext(Ctx);

// One signaling client per signed-in session, plus the live set of online contact ids.
export function SignalingProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new SignalingClient(tokenStore.get));
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<SignalingStatus>(client.status);

  useEffect(() => {
    const unsubscribe = client.subscribe((m) => {
      if (m.type === 'presence-snapshot') setOnline(new Set(m.online));
      if (m.type === 'presence') {
        setOnline((prev) => {
          const next = new Set(prev);
          if (m.online) next.add(m.userId);
          else next.delete(m.userId);
          return next;
        });
      }
    });
    const unwatch = client.onStatus((s) => {
      setStatus(s);
      // Without a connection we can't know who is online; the next snapshot fills it in again
      if (s !== 'open') setOnline(new Set());
    });
    // Connect on the next tick. StrictMode mounts twice in development; connecting straight away opened two
    // sockets at once, and the server could register them in either order and close the one we kept.
    const start = window.setTimeout(() => client.connect(), 0);
    return () => {
      clearTimeout(start);
      unsubscribe();
      unwatch();
      client.disconnect();
    };
  }, [client]);

  return <Ctx.Provider value={{ client, online, status }}>{children}</Ctx.Provider>;
}
