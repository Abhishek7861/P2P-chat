import { Peer } from './Peer';
import type { PeerEvents } from './Peer';
import type { SignalingClient, SignalPayload } from '../services/signaling';

// One Peer per remote user, created on demand: either because I start a chat or because their offer arrives.
export class PeerManager {
  private peers = new Map<string, Peer>();
  private unsubscribe: () => void;
  private myId: string;
  private signaling: SignalingClient;
  private iceServers: () => RTCIceServer[];
  private eventsFor: (peerId: string) => PeerEvents;

  constructor(
    myId: string,
    signaling: SignalingClient,
    iceServers: () => RTCIceServer[],
    eventsFor: (peerId: string) => PeerEvents,
  ) {
    this.myId = myId;
    this.signaling = signaling;
    this.iceServers = iceServers;
    this.eventsFor = eventsFor;
    this.unsubscribe = signaling.subscribe((m) => {
      if (m.type === 'signal') this.route(m.from, m.payload);
    });
  }

  get(peerId: string): Peer {
    let peer = this.peers.get(peerId);
    if (!peer) {
      const events = this.eventsFor(peerId);
      const created: Peer = new Peer(this.myId, peerId, this.signaling, this.iceServers(), {
        ...events,
        onState: (s) => {
          events.onState?.(s);
          // Next get() starts fresh. Only forget this peer if it hasn't been replaced already.
          if ((s === 'failed' || s === 'closed') && this.peers.get(peerId) === created) this.peers.delete(peerId);
        },
      });
      peer = created;
      this.peers.set(peerId, peer);
    }
    return peer;
  }

  has(peerId: string) {
    return this.peers.has(peerId);
  }

  close(peerId: string, notify = true) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (notify) peer.send({ kind: 'bye' });
    peer.close();
    this.peers.delete(peerId);
  }

  dispose() {
    this.unsubscribe();
    [...this.peers.keys()].forEach((id) => this.close(id));
  }

  private route(from: string, payload: SignalPayload) {
    if (payload.kind === 'bye') {
      this.close(from, false);
      return;
    }
    if (payload.kind === 'description' || payload.kind === 'ice') {
      this.get(from)
        .handleSignal(payload)
        .catch((e) => console.error('signal error', e));
    }
    // other kinds (calls, Phase 6) are handled by their own subscribers
  }
}
