import { useEffect, useRef, useState } from 'react';
import { useCall } from '../hooks/useCall';
import { useRingtone } from '../hooks/useRingtone';
import type { User } from '../services/api';
import Avatar from './Avatar';
import { HangUpIcon, MicIcon, MicOffIcon, PhoneIcon } from './Icons';
import './CallPanel.css';

/** m:ss since `since`, ticking every second. */
function useElapsed(since?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return '';
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The ringing screen for incoming calls, the floating panel during a call, and a short notice when one ends.
export default function CallPanel({ personOf }: { personOf: (id: string) => User }) {
  const { call, lastEnded, accept, decline, hangUp, toggleMute } = useCall();
  const audio = useRef<HTMLAudioElement>(null);
  const elapsed = useElapsed(call?.startedAt);
  const ringing = call?.status === 'ringing' ? (call.direction === 'incoming' ? 'incoming' : 'outgoing') : null;
  useRingtone(ringing);

  useEffect(() => {
    if (audio.current) audio.current.srcObject = call?.remoteStream ?? null;
  }, [call?.remoteStream]);

  if (!call) {
    if (!lastEnded) return null;
    return (
      <div className="call-toast" role="status">
        <strong>{personOf(lastEnded.peerId).displayName}</strong>
        <span>{lastEnded.reason}</span>
      </div>
    );
  }

  const peer = personOf(call.peerId);

  if (ringing === 'incoming') {
    return (
      <div className="call-backdrop">
        <div className="call-incoming" role="alertdialog" aria-label={`Incoming call from ${peer.displayName}`}>
          <span className="call-pulse">
            <Avatar user={peer} size={96} />
          </span>
          <h2>{peer.displayName}</h2>
          <p>Incoming {call.media} call…</p>
          <div className="call-answer">
            <button className="call-round call-decline" onClick={decline} aria-label="Decline">
              <HangUpIcon size={26} />
            </button>
            <button className="call-round call-accept" onClick={accept} aria-label="Accept" autoFocus>
              <PhoneIcon size={26} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const status =
    call.status === 'ringing' ? 'Calling…' : call.status === 'connecting' ? 'Connecting…' : elapsed || '0:00';

  return (
    <div className="call-panel" role="region" aria-label={`Call with ${peer.displayName}`}>
      <audio ref={audio} autoPlay />
      <Avatar user={peer} size={44} />
      <div className="call-who">
        <strong>{peer.displayName}</strong>
        <span className={call.status === 'active' ? 'is-live' : undefined}>
          {call.muted && call.status === 'active' ? `${status} · You're muted` : status}
        </span>
      </div>
      {call.status !== 'ringing' && (
        <button
          className={call.muted ? 'call-btn is-on' : 'call-btn'}
          onClick={toggleMute}
          aria-label={call.muted ? 'Unmute' : 'Mute'}
          aria-pressed={call.muted}
          title={call.muted ? 'Unmute' : 'Mute'}
        >
          {call.muted ? <MicOffIcon /> : <MicIcon />}
        </button>
      )}
      <button
        className="call-btn call-end"
        onClick={hangUp}
        aria-label={call.status === 'ringing' ? 'Cancel call' : 'Hang up'}
        title={call.status === 'ringing' ? 'Cancel' : 'Hang up'}
      >
        <HangUpIcon />
      </button>
    </div>
  );
}
