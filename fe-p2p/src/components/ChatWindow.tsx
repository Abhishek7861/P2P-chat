import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePeers } from '../hooks/usePeers';
import type { ConnState } from '../hooks/usePeers';
import { MAX_TEXT } from '../webrtc/chatProtocol';
import type { ChatMessage } from '../webrtc/chatProtocol';
import type { User } from '../services/api';
import Person from './Person';
import './ChatWindow.css';

const STATE_TEXT: Record<ConnState, string> = {
  idle: 'Not connected',
  new: 'Connecting…',
  connecting: 'Connecting…',
  connected: 'Connected directly',
  disconnected: 'Connection interrupted',
  failed: "Couldn't connect",
  closed: 'Disconnected',
};

const TICK: Record<ChatMessage['status'], { mark: string; label: string }> = {
  queued: { mark: '…', label: 'Waiting to send' },
  sent: { mark: '✓', label: 'Sent' },
  delivered: { mark: '✓✓', label: 'Delivered' },
  received: { mark: '', label: '' },
};

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Props = { peer: User; online: boolean; onBack: () => void };

export default function ChatWindow({ peer, online, onBack }: Props) {
  const { conversations, states, connect, sendText, hangUp } = usePeers();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const messages = conversations[peer.id] ?? [];
  const state = states[peer.id] ?? 'idle';
  const connecting = state === 'new' || state === 'connecting';
  const canSend = online || state === 'connected';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    sendText(peer.id, draft);
    setDraft('');
  };

  return (
    <main className="chat">
      <header className="chat-header">
        <button className="btn chat-back" onClick={onBack} aria-label="Back to contacts">
          ←
        </button>
        <Person user={peer} />
        <div className="chat-conn">
          <span className={`chat-state chat-state-${state}`}>
            {/* Presence comes from the server, which a direct connection doesn't need, so it can be stale here */}
            {state === 'connected' ? STATE_TEXT.connected : `${online ? 'Online' : 'Offline'} · ${STATE_TEXT[state]}`}
          </span>
          {state === 'connected' ? (
            <button className="btn" onClick={() => hangUp(peer.id)}>
              Disconnect
            </button>
          ) : (
            <button className="btn" disabled={!online || connecting} onClick={() => connect(peer.id)}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </header>

      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>
              Messages go straight from your browser to {peer.displayName}'s. The server only helps you connect and never
              sees them.
            </p>
            <p>{online ? 'Say hello below.' : `${peer.displayName} is offline. You can chat once they're online.`}</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'me' ? 'msg msg-me' : 'msg'}>
            <div className="msg-bubble">{m.text}</div>
            <div className="msg-meta">
              {time(m.sentAt)}
              {m.from === 'me' && (
                <span className={`msg-tick msg-${m.status}`} title={TICK[m.status].label} aria-label={TICK[m.status].label}>
                  {TICK[m.status].mark}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="chat-composer" onSubmit={submit}>
        <input
          aria-label={`Message ${peer.displayName}`}
          placeholder={canSend ? 'Message' : `${peer.displayName} is offline`}
          maxLength={MAX_TEXT}
          value={draft}
          disabled={!canSend}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSend || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
