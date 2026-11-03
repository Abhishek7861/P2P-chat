import type { SignalingClient, SignalPayload } from '../services/signaling';

export type PeerEvents = {
  onState?: (s: RTCPeerConnectionState) => void;
  onChannel?: (ch: RTCDataChannel) => void;
  onTrack?: (e: RTCTrackEvent) => void; // used from Phase 6
};

// One RTCPeerConnection to one remote user, using the "perfect negotiation" pattern:
// both sides run the same code, and when both send an offer at once the polite side backs down.
export class Peer {
  readonly pc: RTCPeerConnection;
  readonly peerId: string;
  readonly polite: boolean;
  chat?: RTCDataChannel;

  private makingOffer = false;
  private ignoreOffer = false;
  private signaling: SignalingClient;
  private events: PeerEvents;

  constructor(myId: string, peerId: string, signaling: SignalingClient, iceServers: RTCIceServer[], events: PeerEvents) {
    this.peerId = peerId;
    this.signaling = signaling;
    this.events = events;
    this.polite = myId < peerId; // any rule works as long as both sides agree
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription(); // creates the right offer automatically
        this.send({ kind: 'description', description: this.pc.localDescription });
      } catch (err) {
        console.error('negotiation failed', err);
      } finally {
        this.makingOffer = false;
      }
    };
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ kind: 'ice', candidate });
    };
    this.pc.onconnectionstatechange = () => this.events.onState?.(this.pc.connectionState);
    this.pc.ondatachannel = (e) => this.events.onChannel?.(e.channel);
    this.pc.ontrack = (e) => this.events.onTrack?.(e);
  }

  /** Called by the side that starts the conversation. */
  openChat() {
    this.chat = this.pc.createDataChannel('chat', { ordered: true });
    this.events.onChannel?.(this.chat);
  }

  async handleSignal(p: SignalPayload) {
    if (p.kind === 'description') {
      const description = p.description as RTCSessionDescriptionInit;
      const collision = description.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;

      await this.pc.setRemoteDescription(description); // the polite side rolls back its own offer implicitly
      if (description.type === 'offer') {
        await this.pc.setLocalDescription();
        this.send({ kind: 'description', description: this.pc.localDescription });
      }
    } else if (p.kind === 'ice') {
      try {
        await this.pc.addIceCandidate(p.candidate as RTCIceCandidateInit);
      } catch (err) {
        if (!this.ignoreOffer) throw err; // candidates for an offer we ignored are expected to fail
      }
    }
  }

  send(payload: SignalPayload) {
    this.signaling.sendSignal(this.peerId, payload);
  }

  close() {
    this.chat?.close();
    this.pc.close();
    this.events.onState?.('closed'); // pc.close() fires no state event itself
  }
}
