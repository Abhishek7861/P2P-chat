import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PeerManager } from '../webrtc/PeerManager';
import { MAX_TEXT } from '../webrtc/chatProtocol';
import type { ChatFrame, ChatMessage } from '../webrtc/chatProtocol';
import { FileTransfers, fileProblem } from '../webrtc/fileTransfer';
import type { FileFrame, Transfer } from '../webrtc/fileTransfer';
import { DEFAULT_ICE_SERVERS } from '../webrtc/config';
import { useSignaling } from './useSignaling';
import { useAuth } from './useAuth';

export type ConnState = RTCPeerConnectionState | 'idle';

// Everything that travels on the chat channel: chat messages and file-transfer control frames
type Frame = ChatFrame | FileFrame;

type FileActions = {
  accept: (id: string) => void;
  reject: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
};

const isActive = (s?: ConnState) => s === 'new' || s === 'connecting' || s === 'connected' || s === 'disconnected';

// Low-level connection events for features built on top (calls): remote media arriving, and state changes
export type PeerEvent = { type: 'track'; event: RTCTrackEvent } | { type: 'state'; state: RTCPeerConnectionState };
type PeerListener = (peerId: string, e: PeerEvent) => void;

type PeerCtx = {
  conversations: Record<string, ChatMessage[]>;
  states: Record<string, ConnState>;
  transfers: Record<string, Transfer>;
  connect: (peerId: string) => void;
  sendText: (peerId: string, text: string) => void;
  /** Rejects with a readable message if the file can't be sent (empty or too big). */
  sendFile: (peerId: string, file: File) => Promise<void>;
  files: FileActions;
  hangUp: (peerId: string) => void;
  /** Connects if needed and returns the peer connection, so media tracks can be added to it. */
  pcFor: (peerId: string) => RTCPeerConnection | null;
  onPeerEvent: (l: PeerListener) => () => void;
};

const Ctx = createContext<PeerCtx>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export const usePeers = () => useContext(Ctx);

// Owns the PeerManager, the open chat channels, every conversation and every file transfer.
// Messages and received files live only in memory.
export function PeerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { client } = useSignaling();
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  // Created in an effect (not useState) so StrictMode's double mount disposes the first manager
  // instead of leaving a second subscriber that would answer every offer twice.
  const manager = useRef<PeerManager | null>(null);
  const files = useRef<FileTransfers | null>(null);
  const channels = useRef(new Map<string, RTCDataChannel>());
  const outbox = useRef(new Map<string, Frame[]>());
  const peerListeners = useRef(new Set<PeerListener>());

  const addMsg = useCallback(
    (peerId: string, m: ChatMessage) => setConversations((c) => ({ ...c, [peerId]: [...(c[peerId] ?? []), m] })),
    [],
  );
  const patchMsg = useCallback(
    (peerId: string, id: string, patch: Partial<ChatMessage>) =>
      setConversations((c) => ({
        ...c,
        [peerId]: (c[peerId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),
    [],
  );

  // Sends everything queued for this peer, if its channel is open.
  const flush = useCallback(
    (peerId: string) => {
      const ch = channels.current.get(peerId);
      if (ch?.readyState !== 'open') return;
      (outbox.current.get(peerId) ?? []).forEach((f) => {
        ch.send(JSON.stringify(f));
        if (f.t === 'msg') patchMsg(peerId, f.id, { status: 'sent' });
      });
      outbox.current.set(peerId, []);
    },
    [patchMsg],
  );

  const connect = useCallback((peerId: string) => {
    const m = manager.current;
    if (!m) return;
    const peer = m.get(peerId);
    if (!peer.chat && !channels.current.has(peerId)) peer.openChat();
    setStates((x) => (isActive(x[peerId]) ? x : { ...x, [peerId]: 'new' }));
  }, []);

  // Queues a frame and sends it now if the channel is open, otherwise connects first (it's flushed on open)
  const enqueue = useCallback(
    (peerId: string, f: Frame) => {
      outbox.current.set(peerId, [...(outbox.current.get(peerId) ?? []), f]);
      if (channels.current.get(peerId)?.readyState === 'open') flush(peerId);
      else connect(peerId);
    },
    [flush, connect],
  );

  const attach = useCallback(
    (peerId: string, ch: RTCDataChannel) => {
      ch.binaryType = 'arraybuffer';
      if (ch.label.startsWith('file:')) {
        files.current?.handleChannel(peerId, ch);
        return;
      }
      if (ch.label !== 'chat') return;
      channels.current.set(peerId, ch);
      ch.onopen = () => flush(peerId);
      ch.onclose = () => {
        if (channels.current.get(peerId) === ch) channels.current.delete(peerId);
      };
      ch.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        let f: Frame;
        try {
          f = JSON.parse(e.data);
        } catch {
          return;
        }
        if (typeof f?.t !== 'string') return;
        if (f.t.startsWith('file-')) {
          files.current?.handleFrame(peerId, f as FileFrame);
        } else if (f.t === 'msg' && typeof f.id === 'string' && typeof f.text === 'string') {
          const sentAt = typeof f.sentAt === 'number' ? f.sentAt : Date.now();
          addMsg(peerId, { id: f.id, from: 'them', text: f.text.slice(0, MAX_TEXT), sentAt, status: 'received' });
          ch.send(JSON.stringify({ t: 'ack', id: f.id, receivedAt: Date.now() } satisfies ChatFrame));
        } else if (f.t === 'ack' && typeof f.id === 'string') {
          patchMsg(peerId, f.id, { status: 'delivered' });
        }
      };
    },
    [addMsg, patchMsg, flush],
  );

  useEffect(() => {
    if (!user) return;
    const ft = new FileTransfers({
      sendFrame: enqueue,
      // Extra channels on an established connection open almost instantly, with no new negotiation
      openChannel: (peerId, label) => {
        const pc = m.get(peerId).pc;
        return { channel: pc.createDataChannel(label, { ordered: true }), maxMessageSize: pc.sctp?.maxMessageSize };
      },
      onChange: (t) => setTransfers((x) => ({ ...x, [t.id]: t })),
    });
    const m = new PeerManager(
      user.id,
      client,
      () => DEFAULT_ICE_SERVERS,
      (peerId) => ({
        onState: (s) => {
          if (s === 'failed' || s === 'closed') {
            // The channel belongs to the connection that just ended, so the next connect() opens a new one
            channels.current.delete(peerId);
            ft.peerGone(peerId);
          }
          setStates((x) => ({ ...x, [peerId]: s }));
          peerListeners.current.forEach((l) => l(peerId, { type: 'state', state: s }));
        },
        onChannel: (ch) => attach(peerId, ch),
        onTrack: (event) => peerListeners.current.forEach((l) => l(peerId, { type: 'track', event })),
      }),
    );
    manager.current = m;
    files.current = ft;
    return () => {
      m.dispose();
      ft.dispose();
      if (manager.current === m) manager.current = null;
      if (files.current === ft) files.current = null;
    };
  }, [client, user, attach, enqueue]);

  const sendText = useCallback(
    (peerId: string, raw: string) => {
      const text = raw.trim().slice(0, MAX_TEXT);
      if (!text) return;
      const frame: ChatFrame = { t: 'msg', id: crypto.randomUUID(), text, sentAt: Date.now() };
      addMsg(peerId, { id: frame.id, from: 'me', text, sentAt: frame.sentAt, status: 'queued' });
      enqueue(peerId, frame);
    },
    [addMsg, enqueue],
  );

  const sendFile = useCallback(
    async (peerId: string, file: File) => {
      if (!files.current) return;
      const problem = fileProblem(file);
      if (problem) throw new Error(problem);
      connect(peerId); // start connecting while the file is hashed; the offer waits in the outbox
      await files.current.offer(peerId, file);
    },
    [connect],
  );

  const fileActions = useMemo<FileActions>(
    () => ({
      accept: (id) => files.current?.accept(id),
      reject: (id) => files.current?.reject(id),
      pause: (id) => files.current?.pause(id),
      resume: (id) => files.current?.resume(id),
      cancel: (id) => files.current?.cancel(id),
    }),
    [],
  );

  const hangUp = useCallback((peerId: string) => {
    manager.current?.close(peerId);
    channels.current.delete(peerId);
    setStates((x) => ({ ...x, [peerId]: 'idle' }));
  }, []);

  const pcFor = useCallback(
    (peerId: string) => {
      connect(peerId);
      return manager.current?.get(peerId).pc ?? null;
    },
    [connect],
  );

  const onPeerEvent = useCallback((l: PeerListener) => {
    peerListeners.current.add(l);
    return () => {
      peerListeners.current.delete(l);
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        conversations,
        states,
        transfers,
        connect,
        sendText,
        sendFile,
        files: fileActions,
        hangUp,
        pcFor,
        onPeerEvent,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
