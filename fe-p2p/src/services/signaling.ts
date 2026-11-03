// One WebSocket to /ws/signal per signed-in browser. The server reports which contacts are online
// and relays `signal` messages between users without reading their payload.

export type SignalPayload = { kind: string; [key: string]: unknown };

export type ServerMsg =
  | { type: 'presence-snapshot'; online: string[] }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'signal'; from: string; payload: SignalPayload }
  | { type: 'error'; code: string; to?: string }
  | { type: 'pong' };

// 'replaced': this user connected from another tab, and the server closed this socket with code 4000.
export type SignalingStatus = 'connecting' | 'open' | 'closed' | 'replaced';

type Listener = (msg: ServerMsg) => void;
type StatusListener = (status: SignalingStatus) => void;

const PING_MS = 25_000;
const MAX_RETRY_MS = 30_000;
const REPLACED = 4000;

export class SignalingClient {
  private ws?: WebSocket;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private retry = 0;
  private retryTimer?: number;
  private stopped = false;
  private getToken: () => string | null;

  status: SignalingStatus = 'closed';

  constructor(getToken: () => string | null) {
    this.getToken = getToken;
  }

  connect() {
    const token = this.getToken();
    if (!token) return;
    this.stopped = false;
    clearTimeout(this.retryTimer);
    this.setStatus('connecting');

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/signal?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    // Each socket keeps its own ping timer, so a stale socket closing can't stop the current one's
    let pingTimer: number | undefined;

    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      pingTimer = window.setInterval(() => this.raw({ type: 'ping' }), PING_MS);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMsg;
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = (e) => {
      clearInterval(pingTimer);
      if (this.ws !== ws) return; // a stale socket we already replaced
      if (this.stopped) return; // logged out
      if (e.code === REPLACED) {
        this.setStatus('replaced'); // another tab took over; don't fight it
        return;
      }
      this.setStatus('closed');
      const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** this.retry++);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  disconnect() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.setStatus('closed');
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  onStatus(l: StatusListener) {
    this.statusListeners.add(l);
    return () => {
      this.statusListeners.delete(l);
    };
  }

  sendSignal(to: string, payload: SignalPayload) {
    this.raw({ type: 'signal', to, payload });
  }

  private setStatus(status: SignalingStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private raw(o: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }
}
