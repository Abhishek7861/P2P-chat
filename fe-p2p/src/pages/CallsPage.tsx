import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import { IncomingIcon, OutgoingIcon, PhoneIcon } from '../components/Icons';
import { useCall } from '../hooks/useCall';
import { api } from '../services/api';
import type { User } from '../services/api';
import { listTime } from '../utils/time';
import './ContactsPage.css';

type CallRecord = {
  id: string;
  peer: User;
  outgoing: boolean;
  media: 'audio' | 'video';
  status: 'ringing' | 'active' | 'declined' | 'missed' | 'ended';
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

function duration(c: CallRecord) {
  if (!c.answeredAt || !c.endedAt) return '';
  const s = Math.max(0, Math.round((Date.parse(c.endedAt) - Date.parse(c.answeredAt)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Kept short: the list is narrow. Cancelled and unanswered calls are both logged as missed by the server.
function describe(c: CallRecord) {
  const video = c.media === 'video' ? 'Video · ' : '';
  switch (c.status) {
    case 'ended':
      return `${video}${c.outgoing ? 'Outgoing' : 'Incoming'}${duration(c) ? ` · ${duration(c)}` : ''}`;
    case 'missed':
      return `${video}${c.outgoing ? 'No answer' : 'Missed'}`;
    case 'declined':
      return `${video}Declined`;
    case 'active':
      return 'In progress';
    case 'ringing':
      return 'Ringing';
  }
}

// Call history from the server's call log, newest first.
export default function CallsPage({ online, onOpenChat }: { online: Set<string>; onOpenChat: (u: User) => void }) {
  const { call, version, startCall } = useCall();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState('');

  // Reloads whenever a call ends
  useEffect(() => {
    api<CallRecord[]>('/calls')
      .then(setCalls)
      .catch((err: Error) => setError(err.message));
  }, [version]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h1>Calls</h1>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {calls?.length === 0 && <p className="sidebar-empty">No calls yet. Open a chat and press the phone button.</p>}
      <ul className="chat-list">
        {calls?.map((c) => {
          const bad = c.status === 'missed' || c.status === 'declined';
          return (
            <li key={c.id} className="chat-card call-card">
              <button className="call-open" onClick={() => onOpenChat(c.peer)} aria-label={`Chat with ${c.peer.displayName}`}>
                <Avatar user={c.peer} online={online.has(c.peer.id)} />
                <span className="chat-text">
                  <span className="call-top">
                    <strong>{c.peer.displayName}</strong>
                    <span className="chat-time">{listTime(Date.parse(c.createdAt))}</span>
                  </span>
                  <span className={bad ? 'chat-preview call-bad' : 'chat-preview'}>
                    {c.outgoing ? <OutgoingIcon size={14} /> : <IncomingIcon size={14} />}
                    {describe(c)}
                  </span>
                </span>
              </button>
              <button
                className="icon-btn call-back"
                aria-label={`Call ${c.peer.displayName}`}
                title={online.has(c.peer.id) ? 'Call' : `${c.peer.displayName} is offline`}
                disabled={!online.has(c.peer.id) || !!call}
                onClick={() => startCall(c.peer.id, 'audio')}
              >
                <PhoneIcon size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
