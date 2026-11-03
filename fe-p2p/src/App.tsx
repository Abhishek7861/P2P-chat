import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { SignalingProvider, useSignaling } from './hooks/useSignaling';
import { PeerProvider, usePeers } from './hooks/usePeers';
import { useTheme } from './hooks/useTheme';
import type { User } from './services/api';
import Avatar from './components/Avatar';
import Logo from './components/Logo';
import { ChatIcon, LogoutIcon, MoonIcon, SunIcon } from './components/Icons';
import ChatWindow from './components/ChatWindow';
import LoginPage from './pages/LoginPage';
import ContactsPage from './pages/ContactsPage';
import type { LastActivity } from './pages/ContactsPage';
import './App.css';

function Home() {
  const { user, logout } = useAuth();
  const { client, online, status } = useSignaling();
  const { conversations, transfers } = usePeers();
  const { theme, toggle } = useTheme();
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

  // Everything a contact has sent me: messages plus files they offered
  const incomingFiles = Object.values(transfers).filter((t) => t.direction === 'in');
  const received = (id: string) =>
    (conversations[id] ?? []).filter((m) => m.from === 'them').length +
    incomingFiles.filter((t) => t.peerId === id).length;
  const unread: Record<string, number> = {};
  for (const id of new Set([...Object.keys(conversations), ...incomingFiles.map((t) => t.peerId)])) {
    if (id !== active?.id) unread[id] = Math.max(0, received(id) - (seen[id] ?? 0));
  }

  // The latest message or file per contact, for the chat list preview
  const last: Record<string, LastActivity> = {};
  const note = (id: string, a: LastActivity) => {
    if (!last[id] || a.at >= last[id].at) last[id] = a;
  };
  for (const [id, msgs] of Object.entries(conversations)) {
    const m = msgs.at(-1);
    if (m) note(id, { at: m.sentAt, text: m.text, mine: m.from === 'me' });
  }
  for (const t of Object.values(transfers)) {
    note(t.peerId, { at: t.createdAt, text: t.name, mine: t.direction === 'out', file: true });
  }

  // Leaving a chat marks everything in it as seen
  const openChat = (u: User | null) => {
    if (active) setSeen((s) => ({ ...s, [active.id]: received(active.id) }));
    setActive(u);
  };

  return (
    <div className={active ? 'app has-chat' : 'app'}>
      <nav className="rail" aria-label="Main">
        <span className="rail-logo" title="PEER Messenger">
          <Logo />
        </span>
        <button className="rail-btn is-active" aria-label="Chats" title="Chats" onClick={() => openChat(null)}>
          <ChatIcon size={22} />
        </button>
        <span className="rail-spacer" />
        <button
          className="rail-btn"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={toggle}
        >
          {theme === 'dark' ? <SunIcon size={22} /> : <MoonIcon size={22} />}
        </button>
        <button className="rail-btn" aria-label="Log out" title="Log out" onClick={logout}>
          <LogoutIcon size={22} />
        </button>
        <span className="rail-me" title={`Signed in as ${user!.displayName} (@${user!.username})`}>
          <Avatar user={user!} size={38} />
        </span>
      </nav>

      <ContactsPage
        online={online}
        status={status}
        onOpenChat={openChat}
        activeId={active?.id}
        unread={unread}
        last={last}
        notice={
          status === 'replaced' && (
            <div className="notice" role="alert">
              <span>PEER Messenger is open in another tab, so this tab has stopped receiving updates.</span>
              <button className="btn btn-primary" onClick={() => client.connect()}>
                Use here
              </button>
            </div>
          )
        }
      />

      {active ? (
        <ChatWindow key={active.id} peer={active} online={online.has(active.id)} onBack={() => openChat(null)} />
      ) : (
        <main className="welcome">
          <Logo size={72} />
          <h2>Welcome to PEER Messenger</h2>
          <p>Pick a chat to start. Messages and files travel directly between browsers; the server only helps you connect.</p>
        </main>
      )}
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
