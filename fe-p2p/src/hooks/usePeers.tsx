import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PeerManager } from '../webrtc/PeerManager';
import { MAX_TEXT, laterStatus } from '../webrtc/chatProtocol';
import type { ChatFrame, ChatMessage, MessageStatus } from '../webrtc/chatProtocol';
import { E2EE } from '../crypto/e2ee';
import type { Sealed } from '../crypto/e2ee';
import { api } from '../services/api';
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

// A message as the 24-hour store returns it (see MessageController)
type StoredMessage = { id: string; from: string; to: string; sentAt: number; deliveredAt: number | null } & Sealed;

// Owns the PeerManager, the open chat channels, every conversation and every file transfer.
// Messages go directly over the chat channel when the other person is online, and an end-to-end encrypted
// copy is kept on the server for 24 hours, so history survives a refresh and reaches people who were offline.
// Received files live only in memory.
export function PeerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { client, online } = useSignaling();
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
  const e2ee = useRef<E2EE | null>(null);
  const onlineNow = useRef(online);

  useEffect(() => {
    onlineNow.current = online;
  }, [online]);

  // Adds messages to their conversations. A message can arrive twice (directly and from the store, or from two
  // overlapping loads), so ids are merged: the copy already shown is kept, its status only moves forward, and
  // once any copy says it's new it stays new (the first load marks it delivered, so a later one says "seen").
  const mergeMsgs = useCallback(
    (incoming: { peerId: string; m: ChatMessage }[]) =>
      setConversations((c) => {
        const next = { ...c };
        for (const { peerId, m } of incoming) {
          const list = next[peerId] ?? [];
          const i = list.findIndex((x) => x.id === m.id);
          if (i === -1) {
            next[peerId] = [...list, m].sort((a, b) => a.sentAt - b.sentAt);
            continue;
          }
          const old = list[i];
          const status = laterStatus(old.status, m.status);
          const isNew = old.isNew || m.isNew;
          if (status !== old.status || isNew !== old.isNew) {
            next[peerId] = list.map((x, j) => (j === i ? { ...x, status, isNew } : x));
          }
        }
        return next;
      }),
    [],
  );
  const addMsg = useCallback((peerId: string, m: ChatMessage) => mergeMsgs([{ peerId, m }]), [mergeMsgs]);

  // Moves a message's status forward (never back), wherever it is
  const setStatus = useCallback(
    (ids: string[], status: MessageStatus) =>
      setConversations((c) => {
        const want = new Set(ids);
        let changed = false;
        const next: Record<string, ChatMessage[]> = {};
        for (const [peerId, list] of Object.entries(c)) {
          next[peerId] = list.map((m) => {
            if (!want.has(m.id) || laterStatus(m.status, status) === m.status) return m;
            changed = true;
            return { ...m, status };
          });
        }
        return changed ? next : c;
      }),
    [],
  );

  // Loads the last 24 hours from the store, decrypts it and merges it into the conversations
  const sync = useCallback(async () => {
    const crypto = e2ee.current;
    if (!crypto || !user) return;
    let stored: StoredMessage[];
    try {
      await crypto.ready();
      stored = await api<StoredMessage[]>('/messages');
    } catch {
      return; // offline or not ready yet; the next inbox event or reconnect tries again
    }
    const opened = await Promise.all(
      stored.map(async (s) => {
        const mine = s.from === user.id;
        const text = await crypto.open(s);
        const m: ChatMessage = {
          id: s.id,
          from: mine ? 'me' : 'them',
          // Encrypted for another browser's key, or altered on the way (the integrity check failed)
          text: text ?? 'This message can’t be decrypted in this browser',
          sentAt: s.sentAt,
          status: mine ? (s.deliveredAt ? 'delivered' : 'stored') : 'received',
          isNew: !mine && s.deliveredAt === null,
          locked: text === null,
        };
        return { peerId: mine ? s.to : s.from, m };
      }),
    );
    // Merge even if this E2EE instance was replaced meanwhile (React mounts twice in development): it's the same
    // user, and the first load is the one that saw these messages as new before marking them delivered.
    mergeMsgs(opened);
  }, [user, mergeMsgs]);

  // Sends everything queued for this peer, if its channel is open.
  const flush = useCallback(
    (peerId: string) => {
      const ch = channels.current.get(peerId);
      if (ch?.readyState !== 'open') return;
      (outbox.current.get(peerId) ?? []).forEach((f) => {
        ch.send(JSON.stringify(f));
        if (f.t === 'msg') setStatus([f.id], 'sent');
      });
      outbox.current.set(peerId, []);
    },
    [setStatus],
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
          const text = f.text.slice(0, MAX_TEXT);
          addMsg(peerId, { id: f.id, from: 'them', text, sentAt, status: 'received', isNew: true });
          ch.send(JSON.stringify({ t: 'ack', id: f.id, receivedAt: Date.now() } satisfies ChatFrame));
        } else if (f.t === 'ack' && typeof f.id === 'string') {
          setStatus([f.id], 'delivered');
        }
      };
    },
    [addMsg, setStatus, flush],
  );

  // One key pair per signed-in user and browser; history loads once it's ready
  useEffect(() => {
    if (!user) return;
    const crypto = new E2EE(user.id);
    e2ee.current = crypto;
    void sync();
    return () => {
      if (e2ee.current === crypto) e2ee.current = null;
    };
  }, [user, sync]);

  // The store tells us when something new is waiting or my stored messages were delivered;
  // after a reconnect, catch up on anything sent while the connection was down
  useEffect(() => {
    const offMessages = client.subscribe((m) => {
      if (m.type === 'inbox') void sync();
      if (m.type === 'receipt' && Array.isArray(m.ids)) setStatus(m.ids, 'delivered');
    });
    const offStatus = client.onStatus((s) => {
      if (s === 'open') void sync();
    });
    return () => {
      offMessages();
      offStatus();
    };
  }, [client, sync, setStatus]);

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
      const isOnline = onlineNow.current.has(peerId);
      // Directly, if they're online. Connecting to someone offline would only sit at "Connecting…".
      if (isOnline) enqueue(peerId, frame);

      // And an encrypted copy for the store, so it survives a refresh and reaches them if they're offline
      const store = e2ee.current;
      (async () => {
        if (!store) throw new Error('not ready');
        const sealed = await store.seal(frame.id, peerId, text);
        await api('/messages', {
          method: 'POST',
          body: JSON.stringify({ id: frame.id, to: peerId, sentAt: frame.sentAt, ...sealed }),
        });
      })().then(
        () => setStatus([frame.id], 'stored'),
        // Only a failure if the direct route isn't trying either
        () => {
          if (!isOnline) setStatus([frame.id], 'failed');
        },
      );
    },
    [addMsg, enqueue, setStatus],
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
