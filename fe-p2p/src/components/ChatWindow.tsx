import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePeers } from '../hooks/usePeers';
import type { ConnState } from '../hooks/usePeers';
import { MAX_TEXT } from '../webrtc/chatProtocol';
import type { ChatMessage } from '../webrtc/chatProtocol';
import type { Transfer } from '../webrtc/fileTransfer';
import type { User } from '../services/api';
import Person from './Person';
import TransferCard from './TransferCard';
import './ChatWindow.css';

type Item = { kind: 'msg'; at: number; m: ChatMessage } | { kind: 'file'; at: number; t: Transfer };

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
  const { conversations, states, transfers, connect, sendText, sendFile, hangUp } = usePeers();
  const [draft, setDraft] = useState('');
  const [fileError, setFileError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const messages = conversations[peer.id] ?? [];
  const state = states[peer.id] ?? 'idle';
  const connecting = state === 'new' || state === 'connecting';
  const canSend = online || state === 'connected';

  // Messages and files in one timeline, oldest first
  const items: Item[] = [
    ...messages.map((m): Item => ({ kind: 'msg', at: m.sentAt, m })),
    ...Object.values(transfers)
      .filter((t) => t.peerId === peer.id)
      .map((t): Item => ({ kind: 'file', at: t.createdAt, t })),
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    sendText(peer.id, draft);
    setDraft('');
  };

  const pickFile = (file?: File) => {
    setFileError('');
    if (file) sendFile(peer.id, file).catch((err: Error) => setFileError(err.message));
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
        {items.length === 0 && (
          <div className="chat-empty">
            <p>
              Messages and files go straight from your browser to {peer.displayName}'s. The server only helps you
              connect and never sees them.
            </p>
            <p>{online ? 'Say hello below.' : `${peer.displayName} is offline. You can chat once they're online.`}</p>
          </div>
        )}
        {items.map((item) =>
          item.kind === 'file' ? (
            <TransferCard key={item.t.id} t={item.t} peerName={peer.displayName} />
          ) : (
            <div key={item.m.id} className={item.m.from === 'me' ? 'msg msg-me' : 'msg'}>
              <div className="msg-bubble">{item.m.text}</div>
              <div className="msg-meta">
                {time(item.m.sentAt)}
                {item.m.from === 'me' && (
                  <span
                    className={`msg-tick msg-${item.m.status}`}
                    title={TICK[item.m.status].label}
                    aria-label={TICK[item.m.status].label}
                  >
                    {TICK[item.m.status].mark}
                  </span>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {fileError && (
        <p className="error-text chat-file-error" role="alert">
          {fileError}
        </p>
      )}
      <form className="chat-composer" onSubmit={submit}>
        <input
          ref={picker}
          type="file"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = ''; // so picking the same file again still fires onChange
          }}
        />
        <button
          className="btn chat-attach"
          type="button"
          aria-label="Send a file"
          title="Send a file (up to 500 MB)"
          disabled={!canSend}
          onClick={() => picker.current?.click()}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
