import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { SignalingProvider, useSignaling } from './hooks/useSignaling';
import { PeerProvider, usePeers } from './hooks/usePeers';
import type { SignalingStatus } from './services/signaling';
import type { User } from './services/api';
import Person from './components/Person';
import ChatWindow from './components/ChatWindow';
import LoginPage from './pages/LoginPage';
import ContactsPage from './pages/ContactsPage';
import './App.css';

const STATUS_TEXT: Record<SignalingStatus, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Reconnecting…',
  replaced: 'Paused',
};

function Home() {
  const { user, logout } = useAuth();
  const { client, online, status } = useSignaling();
  const { conversations } = usePeers();
  const [active, setActive] = useState<User | null>(null);
  // How many of each contact's messages I've seen; the rest show as an unread badge
  const [seen, setSeen] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev only, for testing signaling from the console: sig.sendSignal('<userId>', { kind: 'hello' }). Remove in Phase 9.
    (window as unknown as { sig: typeof client }).sig = client;
    return client.subscribe((m) => {
      if (m.type === 'signal' || m.type === 'error') console.log('[sig]', m);
    });
  }, [client]);

  const received = (id: string) => (conversations[id] ?? []).filter((m) => m.from === 'them').length;
  const unread: Record<string, number> = {};
  for (const id of Object.keys(conversations)) {
    if (id !== active?.id) unread[id] = Math.max(0, received(id) - (seen[id] ?? 0));
  }

  // Leaving a chat marks everything in it as seen
  const openChat = (u: User | null) => {
    if (active) setSeen((s) => ({ ...s, [active.id]: received(active.id) }));
    setActive(u);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">P2P Messenger</span>
        <div className="app-user">
          <span className={`conn-status conn-${status}`} role="status" title={STATUS_TEXT[status]}>
            {STATUS_TEXT[status]}
          </span>
          <Person user={user!} />
          <button className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      {status === 'replaced' && (
        <div className="app-banner" role="alert">
          <span>P2P Messenger is open in another tab, so this tab has stopped receiving updates.</span>
          <button className="btn" onClick={() => client.connect()}>
            Use here
          </button>
        </div>
      )}
      <div className={active ? 'contacts-layout has-chat' : 'contacts-layout'}>
        <ContactsPage online={online} onOpenChat={openChat} activeId={active?.id} unread={unread} />
        {active ? (
          <ChatWindow key={active.id} peer={active} online={online.has(active.id)} onBack={() => openChat(null)} />
        ) : (
          <main className="contacts-main">
            <h2>Pick a contact to start chatting</h2>
            <p>Messages travel directly between browsers. The server only helps you connect.</p>
          </main>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();

  if (!ready) return null;
  if (!user) return <LoginPage />;

  // Keyed by user so a different sign-in gets a fresh connection
  return (
    <SignalingProvider key={user.id}>
      <PeerProvider>
        <Home />
      </PeerProvider>
    </SignalingProvider>
  );
}
