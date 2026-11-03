import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCall } from '../hooks/useCall';
import { usePeers } from '../hooks/usePeers';
import type { ConnState } from '../hooks/usePeers';
import { MAX_TEXT } from '../webrtc/chatProtocol';
import type { ChatMessage } from '../webrtc/chatProtocol';
import type { Transfer } from '../webrtc/fileTransfer';
import type { User } from '../services/api';
import { clock, dayLabel, sameDay } from '../utils/time';
import Avatar from './Avatar';
import TransferCard from './TransferCard';
import { BackIcon, CheckDoubleIcon, CheckIcon, ClockIcon, FolderIcon, LinkIcon, PhoneIcon, SendIcon } from './Icons';
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

const GROUP_MS = 5 * 60 * 1000; // messages this close together from the same person share one avatar

const mine = (i: Item) => (i.kind === 'msg' ? i.m.from === 'me' : i.t.direction === 'out');

function Tick({ status }: { status: ChatMessage['status'] }) {
  if (status === 'queued')
    return (
      <span className="tick" title="Waiting to send" aria-label="Waiting to send">
        <ClockIcon />
      </span>
    );
  if (status === 'stored')
    return (
      <span
        className="tick"
        title="Saved encrypted on the server. They'll get it when they're online."
        aria-label="Saved for delivery"
      >
        <CheckIcon />
      </span>
    );
  if (status === 'sent')
    return (
      <span className="tick" title="Sent" aria-label="Sent">
        <CheckIcon />
      </span>
    );
  if (status === 'failed')
    return (
      <span className="tick tick-failed" title="Not sent. They're offline and it couldn't be saved." aria-label="Not sent">
        Not sent
      </span>
    );
  if (status === 'delivered')
    return (
      <span className="tick tick-delivered" title="Delivered" aria-label="Delivered">
        <CheckDoubleIcon />
      </span>
    );
  return null;
}

type Props = { peer: User; online: boolean; onBack: () => void };

export default function ChatWindow({ peer, online, onBack }: Props) {
  const { user } = useAuth();
  const { conversations, states, transfers, connect, sendText, sendFile, hangUp } = usePeers();
  const { call, startCall } = useCall();
  const [draft, setDraft] = useState('');
  const [fileError, setFileError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const messages = conversations[peer.id] ?? [];
  const state = states[peer.id] ?? 'idle';
  const connecting = state === 'new' || state === 'connecting';
  // Text can always be sent: offline contacts get it from the 24-hour store. Files need a live connection.
  const canSendFile = online || state === 'connected';

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
    sendText(peer.id, draft);
    setDraft('');
  };

  const pickFile = (file?: File) => {
    setFileError('');
    if (file) sendFile(peer.id, file).catch((err: Error) => setFileError(err.message));
  };

  // Presence comes from the server, which a direct connection doesn't need, so it can be stale while connected
  const statusLine = state === 'connected' ? STATE_TEXT.connected : `${online ? 'Online' : 'Offline'} · ${STATE_TEXT[state]}`;

  return (
    <main className="chat">
      <header className="chat-header">
        <button className="icon-btn chat-back" onClick={onBack} aria-label="Back to chats">
          <BackIcon size={22} />
        </button>
        <Avatar user={peer} size={42} online={online} />
        <div className="chat-who">
          <strong>{peer.displayName}</strong>
          <span className={`chat-state chat-state-${state}${online ? ' is-online' : ''}`}>{statusLine}</span>
        </div>
        <button
          className="icon-btn chat-call"
          aria-label={`Call ${peer.displayName}`}
          title={!online ? `${peer.displayName} is offline` : call ? "You're already in a call" : 'Audio call'}
          disabled={!online || !!call}
          onClick={() => startCall(peer.id, 'audio')}
        >
          <PhoneIcon />
        </button>
        {state === 'connected' ? (
          <button className="btn" onClick={() => hangUp(peer.id)}>
            Disconnect
          </button>
        ) : (
          <button className="btn" disabled={!online || connecting} onClick={() => connect(peer.id)}>
            <LinkIcon size={16} />
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </header>

      <div className="chat-messages" aria-live="polite">
        {items.length === 0 && (
          <div className="chat-empty">
            <Avatar user={peer} size={72} />
            <h2>{peer.displayName}</h2>
            <p>
              Messages go straight to {peer.displayName}'s browser when you're both online. An end-to-end encrypted
              copy is kept on the server for 24 hours, which the server can't read, so offline messages still arrive.
              Files never touch the server.
            </p>
            <p>{online ? 'Say hello below.' : `${peer.displayName} is offline, but they'll get your messages when they're back.`}</p>
          </div>
        )}
        {items.map((item, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const me = mine(item);
          const newDay = !prev || !sameDay(prev.at, item.at);
          // The avatar sits beside the last item of a run from the same person
          const endsGroup = !next || mine(next) !== me || !sameDay(next.at, item.at) || next.at - item.at > GROUP_MS;
          const key = item.kind === 'msg' ? item.m.id : item.t.id;
          return (
            <div key={key} className="chat-item">
              {newDay && (
                <div className="day-sep">
                  <span>{dayLabel(item.at)}</span>
                </div>
              )}
              <div className={me ? 'row row-me' : 'row'}>
                {endsGroup ? <Avatar user={me ? user! : peer} size={36} /> : <span className="avatar-gap" />}
                <div className="row-body">
                  <div className="row-meta">
                    {me ? (
                      <>
                        {item.kind === 'msg' && <Tick status={item.m.status} />}
                        <span>{clock(item.at)}</span>
                        <span className="sep" aria-hidden="true" />
                        <strong>You</strong>
                      </>
                    ) : (
                      <>
                        <strong>{peer.displayName}</strong>
                        <span className="sep" aria-hidden="true" />
                        <span>{clock(item.at)}</span>
                      </>
                    )}
                  </div>
                  {item.kind === 'msg' ? (
                    <div className={item.m.locked ? 'bubble bubble-locked' : 'bubble'}>{item.m.text}</div>
                  ) : (
                    <TransferCard t={item.t} peerName={peer.displayName} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {fileError && (
        <p className="error-text chat-file-error" role="alert">
          {fileError}
        </p>
      )}
      <form className="composer" onSubmit={submit}>
        <input
          ref={picker}
          type="file"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = ''; // so picking the same file again still fires onChange
          }}
        />
        <div className="composer-box">
          <input
            className="composer-input"
            aria-label={`Message ${peer.displayName}`}
            placeholder={online || state === 'connected' ? 'Type your message' : "Type a message. They'll get it when they're back"}
            maxLength={MAX_TEXT}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="icon-btn"
            type="button"
            aria-label="Send a file"
            title={canSendFile ? 'Send a file (up to 500 MB)' : 'Files need them to be online'}
            disabled={!canSendFile}
            onClick={() => picker.current?.click()}
          >
            <FolderIcon />
          </button>
          <button className="send-btn" type="submit" aria-label="Send" disabled={!draft.trim()}>
            <SendIcon size={18} />
          </button>
        </div>
      </form>
    </main>
  );
}
