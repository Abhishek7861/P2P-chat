import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Person from '../components/Person';
import { api } from '../services/api';
import type { User } from '../services/api';
import './ContactsPage.css';

type Props = { onOpenChat?: (u: User) => void; online?: Set<string> };

export default function ContactsPage({ onOpenChat, online }: Props) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [error, setError] = useState('');

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

  return (
    <div className="contacts-layout">
      <aside className="contacts-sidebar">
        <form className="contacts-search" onSubmit={search}>
          <input
            aria-label="Find people"
            placeholder="Find people"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Search
          </button>
        </form>
        {error && (
          <p className="error-text contacts-error" role="alert">
            {error}
          </p>
        )}

        {results && (
          <section className="contacts-section">
            <div className="contacts-heading">
              <h2>Search results</h2>
              <button className="contacts-clear" onClick={clearSearch}>
                Clear
              </button>
            </div>
            {results.length === 0 && <p className="contacts-empty">No people found.</p>}
            <ul className="contacts-list">
              {results.map((u) => {
                const added = contacts.some((c) => c.id === u.id);
                return (
                  <li key={u.id} className="contacts-row">
                    <Person user={u} />
                    <button className="btn" disabled={added} onClick={() => add(u)}>
                      {added ? 'Added' : 'Add'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="contacts-section">
          <div className="contacts-heading">
            <h2>Contacts</h2>
            <span>{contacts.length}</span>
          </div>
          {contacts.length === 0 && (
            <p className="contacts-empty">No contacts yet. Search above to add someone.</p>
          )}
          <ul className="contacts-list">
            {contacts.map((c) => (
              <li key={c.id} className="contacts-row">
                <Person user={c} />
                {online && (
                  <span
                    className={online.has(c.id) ? 'status-dot status-online' : 'status-dot'}
                    title={online.has(c.id) ? 'Online' : 'Offline'}
                  />
                )}
                {onOpenChat && (
                  <button className="btn" onClick={() => onOpenChat(c)}>
                    Chat
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="contacts-main">
        <h2>Your conversations will appear here</h2>
        <p>Peer-to-peer chat is coming soon. For now, find people and build your contact list.</p>
      </main>
    </div>
  );
}
