import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Avatar from '../components/Avatar';
import Person from '../components/Person';
import { FileIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { api } from '../services/api';
import type { User } from '../services/api';
import type { SignalingStatus } from '../services/signaling';
import { listTime } from '../utils/time';
import './ContactsPage.css';

export type LastActivity = { at: number; text: string; mine: boolean; file?: boolean };

const STATUS_TEXT: Record<SignalingStatus, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Reconnecting…',
  replaced: 'Paused',
};

type Props = {
  onOpenChat: (u: User) => void;
  online: Set<string>;
  status: SignalingStatus;
  activeId?: string;
  unread?: Record<string, number>;
  last?: Record<string, LastActivity>;
  notice?: ReactNode;
};

// The chat list: find people and add them, see who's online, and pick a contact to chat with.
export default function ContactsPage({ onOpenChat, online, status, activeId, unread = {}, last = {}, notice }: Props) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [error, setError] = useState('');
  const searchBox = useRef<HTMLInputElement>(null);

  const fail = (err: unknown) => setError((err as Error).message);
  const load = useCallback(
    () =>
      api<User[]>('/contacts')
        .then(setContacts)
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const clearSearch = () => {
    setResults(null);
    setQ('');
    setError('');
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (q.trim().length < 2) {
      setError('Enter at least 2 characters to search.');
      return;
    }
    try {
      setResults(await api<User[]>(`/users/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      fail(err);
    }
  };

  const add = async (u: User) => {
    setError('');
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify({ username: u.username }) });
      clearSearch();
      await load();
    } catch (err) {
      fail(err);
    }
  };

  // Most recent conversation first, then alphabetical
  const sorted = [...contacts].sort(
    (a, b) => (last[b.id]?.at ?? 0) - (last[a.id]?.at ?? 0) || a.displayName.localeCompare(b.displayName),
  );
  const onlineNow = sorted.filter((c) => online.has(c.id));

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h1>Chats</h1>
        <span className={`conn-chip conn-${status}`} role="status">
          {STATUS_TEXT[status]}
        </span>
        <button
          className="add-btn"
          aria-label="Find people to add"
          title="Find people to add"
          onClick={() => searchBox.current?.focus()}
        >
          <PlusIcon size={18} />
        </button>
      </div>

      {notice}

      <form className="search" onSubmit={search} role="search">
        <input
          ref={searchBox}
          aria-label="Search for people by name or username"
          placeholder="Search for people to add"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="search-btn" type="submit" aria-label="Search">
          <SearchIcon size={18} />
        </button>
      </form>
      {error && (
        <p className="error-text sidebar-error" role="alert">
          {error}
        </p>
      )}

      {results && (
        <section className="sidebar-section">
          <div className="section-head">
            <h2>Search results</h2>
            <button className="link-btn" onClick={clearSearch}>
              Clear
            </button>
          </div>
          {results.length === 0 && <p className="sidebar-empty">No people found.</p>}
          <ul className="chat-list">
            {results.map((u) => {
              const added = contacts.some((c) => c.id === u.id);
              return (
                <li key={u.id} className="chat-card">
                  <Person user={u} />
                  <button className={added ? 'btn' : 'btn btn-primary'} disabled={added} onClick={() => add(u)}>
                    {added ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {onlineNow.length > 0 && (
        <section className="sidebar-section">
          <div className="section-head">
            <h2>Online now</h2>
          </div>
          <ul className="online-row">
            {onlineNow.map((c) => (
              <li key={c.id}>
                <button className="online-person" onClick={() => onOpenChat(c)} aria-label={`Chat with ${c.displayName}`}>
                  <Avatar user={c} size={52} online />
                  <span>{c.displayName.split(/\s+/)[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sidebar-section">
        <div className="section-head">
          <h2>All chats</h2>
          <span className="count">{contacts.length}</span>
        </div>
        {contacts.length === 0 && (
          <p className="sidebar-empty">No contacts yet. Use the search above to find people and add them.</p>
        )}
        <ul className="chat-list">
          {sorted.map((c) => {
            const count = unread[c.id] ?? 0;
            const isOnline = online.has(c.id);
            const a = last[c.id];
            const label = `${c.displayName}, ${isOnline ? 'online' : 'offline'}${count ? `, ${count} unread` : ''}`;
            return (
              <li key={c.id}>
                <button
                  className={c.id === activeId ? 'chat-card chat-open is-active' : 'chat-card chat-open'}
                  aria-label={label}
                  aria-current={c.id === activeId ? 'true' : undefined}
                  onClick={() => onOpenChat(c)}
                >
                  <Avatar user={c} online={isOnline} />
                  <span className="chat-text">
                    <strong>{c.displayName}</strong>
                    <span className="chat-preview">
                      {a ? (
                        <>
                          {a.file && <FileIcon size={14} />}
                          {a.mine ? `You: ${a.text}` : a.text}
                        </>
                      ) : (
                        `@${c.username}`
                      )}
                    </span>
                  </span>
                  <span className="chat-side">
                    {a && <span className="chat-time">{listTime(a.at)}</span>}
                    {count > 0 && <span className="unread-badge">{count > 99 ? '99+' : count}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
