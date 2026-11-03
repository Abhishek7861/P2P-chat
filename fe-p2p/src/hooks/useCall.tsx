import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSignaling } from './useSignaling';
import { usePeers } from './usePeers';

// Call control (invite, accept, decline, busy, end) goes over the signaling WebSocket, because the callee may
// not have a peer connection yet when the call starts. The audio itself rides the existing peer connection:
// adding a track triggers renegotiation, which the perfect-negotiation code in Peer handles.

export type Media = 'audio' | 'video';

export type CallState = {
  callId: string;
  peerId: string;
  direction: 'outgoing' | 'incoming';
  media: Media;
  status: 'ringing' | 'connecting' | 'active';
  muted: boolean;
  startedAt?: number;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
};

/** Why the last call ended, shown briefly after it's gone. */
export type CallEnded = { reason: string; peerId: string; at: number };

type CallCtx = {
  call: CallState | null;
  lastEnded: CallEnded | null;
  /** Goes up every time a call ends, so the call history knows to reload. */
  version: number;
  startCall: (peerId: string, media: Media) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
};

const Ctx = createContext<CallCtx>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export const useCall = () => useContext(Ctx);

const RING_TIMEOUT_MS = 30_000;
const TOAST_MS = 5_000;

function getMedia(media: Media) {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: media === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { client } = useSignaling();
  const { pcFor, onPeerEvent } = usePeers();
  const [call, setCallState] = useState<CallState | null>(null);
  const [lastEnded, setLastEnded] = useState<CallEnded | null>(null);
  const [version, setVersion] = useState(0);
  // The ref is read by event handlers, which would otherwise see a stale call
  const callRef = useRef<CallState | null>(null);
  const sending = useRef<{ pc: RTCPeerConnection; senders: RTCRtpSender[] } | null>(null);
  const ringTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const setCall = useCallback((next: CallState | null) => {
    callRef.current = next;
    setCallState(next);
  }, []);

  const patch = useCallback(
    (p: Partial<CallState>) => {
      if (callRef.current) setCall({ ...callRef.current, ...p });
    },
    [setCall],
  );

  const notify = useCallback((reason: string, peerId: string) => {
    setLastEnded({ reason, peerId, at: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setLastEnded(null), TOAST_MS);
  }, []);

  const send = useCallback(
    (kind: string, extra: object = {}) => {
      const c = callRef.current;
      if (c) client.sendSignal(c.peerId, { kind, callId: c.callId, ...extra });
    },
    [client],
  );

  // Ends the call locally. Removing the tracks (rather than closing the connection) keeps chat and files working.
  const cleanup = useCallback(
    (reason: string) => {
      clearTimeout(ringTimer.current);
      const c = callRef.current;
      const s = sending.current;
      if (s && s.pc.signalingState !== 'closed') {
        s.senders.forEach((sender) => {
          try {
            s.pc.removeTrack(sender);
          } catch {
            // already gone
          }
        });
      }
      sending.current = null;
      c?.localStream?.getTracks().forEach((t) => t.stop()); // turns the browser's mic indicator off
      setCall(null);
      if (c) {
        notify(reason, c.peerId);
        setVersion((v) => v + 1);
      }
    },
    [setCall, notify],
  );

  const addTracks = useCallback(
    (peerId: string, stream: MediaStream) => {
      const pc = pcFor(peerId);
      if (!pc) return;
      sending.current = { pc, senders: stream.getTracks().map((t) => pc.addTrack(t, stream)) };
    },
    [pcFor],
  );

  const startCall = useCallback(
    async (peerId: string, media: Media) => {
      if (callRef.current) return;
      let stream: MediaStream;
      try {
        stream = await getMedia(media);
      } catch {
        notify('Microphone access was blocked. Allow it in the browser to make calls.', peerId);
        return;
      }
      if (callRef.current) {
        stream.getTracks().forEach((t) => t.stop()); // a call arrived while the permission prompt was open
        return;
      }
      setCall({ callId: crypto.randomUUID(), peerId, direction: 'outgoing', media, status: 'ringing', muted: false, localStream: stream });
      pcFor(peerId); // connect now: the callee's offer (with its audio) may arrive before its call-accept
      send('call-invite', { media });
      ringTimer.current = window.setTimeout(() => {
        if (callRef.current?.status === 'ringing') {
          send('call-end');
          cleanup('No answer');
        }
      }, RING_TIMEOUT_MS);
    },
    [setCall, pcFor, send, cleanup, notify],
  );

  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.direction !== 'incoming' || c.status !== 'ringing') return;
    clearTimeout(ringTimer.current);
    let stream: MediaStream;
    try {
      stream = await getMedia(c.media);
    } catch {
      send('call-decline');
      cleanup('Microphone access was blocked, so the call was declined.');
      return;
    }
    if (callRef.current?.callId !== c.callId) {
      stream.getTracks().forEach((t) => t.stop()); // the caller hung up while the permission prompt was open
      return;
    }
    patch({ status: 'connecting', localStream: stream });
    addTracks(c.peerId, stream);
    send('call-accept');
  }, [send, cleanup, patch, addTracks]);

  const decline = useCallback(() => {
    send('call-decline');
    cleanup('Declined');
  }, [send, cleanup]);

  const hangUp = useCallback(() => {
    send('call-end');
    cleanup(callRef.current?.status === 'ringing' ? 'Cancelled' : 'Call ended');
  }, [send, cleanup]);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c?.localStream) return;
    const muted = !c.muted;
    c.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !muted; // sends silence and keeps the track, so unmuting needs no renegotiation
    });
    patch({ muted });
  }, [patch]);

  useEffect(() => {
    const offSignals = client.subscribe((m) => {
      const c = callRef.current;
      if (m.type === 'error' && m.code === 'peer-offline' && c && m.to === c.peerId) {
        cleanup('They went offline');
        return;
      }
      if (m.type !== 'signal' || typeof m.payload.kind !== 'string' || !m.payload.kind.startsWith('call-')) return;
      const { kind, callId, media } = m.payload;
      if (typeof callId !== 'string') return;

      if (kind === 'call-invite') {
        if (c) {
          client.sendSignal(m.from, { kind: 'call-busy', callId }); // already in a call
          return;
        }
        setCall({
          callId,
          peerId: m.from,
          direction: 'incoming',
          media: media === 'video' ? 'video' : 'audio',
          status: 'ringing',
          muted: false,
        });
        ringTimer.current = window.setTimeout(() => {
          if (callRef.current?.callId === callId && callRef.current.status === 'ringing') cleanup('Missed call');
        }, RING_TIMEOUT_MS);
        return;
      }

      if (!c || c.callId !== callId || c.peerId !== m.from) return; // stale or spoofed
      if (kind === 'call-accept' && c.direction === 'outgoing' && c.status === 'ringing') {
        clearTimeout(ringTimer.current);
        patch({ status: 'connecting' });
        addTracks(c.peerId, c.localStream!);
      } else if (kind === 'call-decline') cleanup('Declined');
      else if (kind === 'call-busy') cleanup('Busy in another call');
      else if (kind === 'call-end') cleanup(c.status === 'ringing' && c.direction === 'incoming' ? 'Missed call' : 'Call ended');
    });

    const offPeers = onPeerEvent((peerId, e) => {
      const c = callRef.current;
      if (!c || c.peerId !== peerId) return;
      if (e.type === 'state' && (e.state === 'failed' || e.state === 'closed')) {
        cleanup('Connection lost');
      } else if (e.type === 'track' && c.status !== 'ringing') {
        // Remote audio arrived: the call is live
        const remote = e.event.streams[0] ?? new MediaStream([e.event.track]);
        patch({ remoteStream: remote, status: 'active', startedAt: c.startedAt ?? Date.now() });
      }
    });

    // Closing the tab mid-call: tell the other side instead of leaving them on a silent line
    const onHide = () => {
      if (callRef.current) send('call-end');
    };
    window.addEventListener('pagehide', onHide);

    return () => {
      offSignals();
      offPeers();
      window.removeEventListener('pagehide', onHide);
      // Logging out mid-call: end it and release the microphone
      if (callRef.current) {
        send('call-end');
        callRef.current.localStream?.getTracks().forEach((t) => t.stop());
      }
      clearTimeout(ringTimer.current);
      clearTimeout(toastTimer.current);
    };
  }, [client, onPeerEvent, setCall, patch, cleanup, addTracks, send]);

  return (
    <Ctx.Provider value={{ call, lastEnded, version, startCall, accept, decline, hangUp, toggleMute }}>
      {children}
    </Ctx.Provider>
  );
}
