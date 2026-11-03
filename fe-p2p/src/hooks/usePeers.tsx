import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PeerManager } from '../webrtc/PeerManager';
import { MAX_TEXT } from '../webrtc/chatProtocol';
import type { ChatFrame, ChatMessage } from '../webrtc/chatProtocol';
import { DEFAULT_ICE_SERVERS } from '../webrtc/config';
import { useSignaling } from './useSignaling';
import { useAuth } from './useAuth';

export type ConnState = RTCPeerConnectionState | 'idle';

const isActive = (s?: ConnState) => s === 'new' || s === 'connecting' || s === 'connected' || s === 'disconnected';

type PeerCtx = {
  conversations: Record<string, ChatMessage[]>;
  states: Record<string, ConnState>;
  connect: (peerId: string) => void;
  sendText: (peerId: string, text: string) => void;
  hangUp: (peerId: string) => void;
};

const Ctx = createContext<PeerCtx>(null!);

// eslint-disable-next-line react-refresh/only-export-components
export const usePeers = () => useContext(Ctx);

// Owns the PeerManager, the open chat channels and every conversation. Messages live only in memory.
export function PeerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { client } = useSignaling();
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const [states, setStates] = useState<Record<string, ConnState>>({});
  // Created in an effect (not useState) so StrictMode's double mount disposes the first manager
  // instead of leaving a second subscriber that would answer every offer twice.
  const manager = useRef<PeerManager | null>(null);
  const channels = useRef(new Map<string, RTCDataChannel>());
  const outbox = useRef(new Map<string, ChatFrame[]>());

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

  const attach = useCallback(
    (peerId: string, ch: RTCDataChannel) => {
      ch.binaryType = 'arraybuffer'; // Phase 5 sends binary chunks on another channel
      if (ch.label !== 'chat') return;
      channels.current.set(peerId, ch);
      ch.onopen = () => flush(peerId);
      ch.onclose = () => {
        if (channels.current.get(peerId) === ch) channels.current.delete(peerId);
      };
      ch.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        let f: ChatFrame;
        try {
          f = JSON.parse(e.data);
        } catch {
          return;
        }
        if (f.t === 'msg' && typeof f.id === 'string' && typeof f.text === 'string') {
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
    const m = new PeerManager(
      user.id,
      client,
      () => DEFAULT_ICE_SERVERS,
      (peerId) => ({
        onState: (s) => {
          // The channel belongs to the connection that just ended, so the next connect() opens a new one
          if (s === 'failed' || s === 'closed') channels.current.delete(peerId);
          setStates((x) => ({ ...x, [peerId]: s }));
        },
        onChannel: (ch) => attach(peerId, ch),
      }),
    );
    manager.current = m;
    return () => {
      m.dispose();
      if (manager.current === m) manager.current = null;
    };
  }, [client, user, attach]);

  const connect = useCallback((peerId: string) => {
    const m = manager.current;
    if (!m) return;
    const peer = m.get(peerId);
    if (!peer.chat && !channels.current.has(peerId)) peer.openChat();
    setStates((x) => (isActive(x[peerId]) ? x : { ...x, [peerId]: 'new' }));
  }, []);

  const sendText = useCallback(
    (peerId: string, raw: string) => {
      const text = raw.trim().slice(0, MAX_TEXT);
      if (!text) return;
      const frame: ChatFrame = { t: 'msg', id: crypto.randomUUID(), text, sentAt: Date.now() };
      addMsg(peerId, { id: frame.id, from: 'me', text, sentAt: frame.sentAt, status: 'queued' });
      outbox.current.set(peerId, [...(outbox.current.get(peerId) ?? []), frame]);
      if (channels.current.get(peerId)?.readyState === 'open') flush(peerId);
      else connect(peerId);
    },
    [addMsg, flush, connect],
  );

  const hangUp = useCallback((peerId: string) => {
    manager.current?.close(peerId);
    channels.current.delete(peerId);
    setStates((x) => ({ ...x, [peerId]: 'idle' }));
  }, []);

  return <Ctx.Provider value={{ conversations, states, connect, sendText, hangUp }}>{children}</Ctx.Provider>;
}
