// P2P file transfer. Control frames (offer, accept, pause, cancel, done) travel on the chat channel;
// the bytes go over a separate data channel per transfer, labelled `file:<id>`, so a big file never blocks chat.
//
//   sender                          receiver
//   file-offer {id, name, size, sha256}  →
//                                   ←  file-accept {id, offset}
//   opens channel "file:<id>", sends 64 KiB chunks (with backpressure), then "EOF"
//                                   ←  file-done {id, ok}   (after checking size and SHA-256)
//
// The channel is reliable and ordered, so "bytes received" is an exact resume point: after a dropped
// connection the receiver sends file-accept again with offset = bytes it already has.

export type FileFrame =
  | { t: 'file-offer'; id: string; name: string; size: number; mime: string; sha256: string }
  | { t: 'file-accept'; id: string; offset: number }
  | { t: 'file-reject'; id: string }
  | { t: 'file-pause'; id: string }
  | { t: 'file-resume'; id: string }
  | { t: 'file-cancel'; id: string }
  | { t: 'file-done'; id: string; ok: boolean };

export type TransferStatus =
  | 'hashing'
  | 'offered'
  | 'waiting'
  | 'transferring'
  | 'paused'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'interrupted';

export type Transfer = {
  id: string;
  peerId: string;
  direction: 'out' | 'in';
  name: string;
  size: number;
  mime: string;
  sha256: string;
  bytes: number;
  status: TransferStatus;
  createdAt: number;
  url?: string; // receiver: download link once verified
};

const CHUNK = 64 * 1024;
const HIGH_WATER = 4 * 1024 * 1024; // stop sending while this much is buffered
const LOW_WATER = 1024 * 1024; // carry on once the buffer drains to this
const EMIT_EVERY = 512 * 1024; // progress updates, so React isn't re-rendered for every chunk
export const MAX_FILE = 500 * 1024 * 1024; // the receiver keeps the whole file in memory until it's verified

/** Why this file can't be sent, or null if it can. */
export function fileProblem(file: File): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_FILE) return 'Files can be up to 500 MB.';
  return null;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolves on bufferedamountlow, or on close so a dead channel can't leave the sender waiting forever.
const drained = (ch: RTCDataChannel) =>
  new Promise<void>((resolve) => {
    const done = () => {
      ch.removeEventListener('bufferedamountlow', done);
      ch.removeEventListener('close', done);
      resolve();
    };
    ch.addEventListener('bufferedamountlow', done);
    ch.addEventListener('close', done);
  });

const ACTIVE: TransferStatus[] = ['waiting', 'transferring', 'paused'];

type Out = { t: Transfer; file: File; paused: boolean; cancelled: boolean; channel?: RTCDataChannel };
type In = { t: Transfer; chunks: ArrayBuffer[]; lastEmit: number; channel?: RTCDataChannel };

type Deps = {
  sendFrame: (peerId: string, f: FileFrame) => void;
  openChannel: (peerId: string, label: string) => { channel: RTCDataChannel; maxMessageSize?: number };
  onChange: (t: Transfer) => void;
};

export class FileTransfers {
  private out = new Map<string, Out>();
  private in = new Map<string, In>();
  private deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  // ---------- sender ----------

  async offer(peerId: string, file: File) {
    const problem = fileProblem(file);
    if (problem) throw new Error(problem);
    const t: Transfer = {
      id: crypto.randomUUID(),
      peerId,
      direction: 'out',
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      sha256: '',
      bytes: 0,
      status: 'hashing',
      createdAt: Date.now(),
    };
    const o: Out = { t, file, paused: false, cancelled: false };
    this.out.set(t.id, o);
    this.set(t, {});
    const sha256 = await sha256Hex(file);
    if (o.cancelled) return; // cancelled while hashing
    this.deps.sendFrame(peerId, { t: 'file-offer', id: t.id, name: t.name, size: t.size, mime: t.mime, sha256 });
    this.set(t, { sha256, status: 'offered' });
  }

  private async pump(o: Out, offset: number) {
    const { t, file } = o;
    o.channel?.close(); // a resume replaces the old channel; its loop notices and stops
    const { channel: ch, maxMessageSize } = this.deps.openChannel(t.peerId, `file:${t.id}`);
    ch.binaryType = 'arraybuffer';
    ch.bufferedAmountLowThreshold = LOW_WATER;
    o.channel = ch;
    const chunk = Math.min(CHUNK, maxMessageSize || 16 * 1024);
    const current = () => o.channel === ch && !o.cancelled;

    try {
      await new Promise<void>((resolve, reject) => {
        ch.onopen = () => resolve();
        ch.onclose = () => reject(new Error('channel closed'));
      });
      ch.onclose = null;
      let pos = Math.min(offset, file.size);
      let lastEmit = pos;
      this.set(t, { status: o.paused ? 'paused' : 'transferring', bytes: pos });
      while (pos < file.size) {
        if (!current()) return;
        if (ch.readyState !== 'open') throw new Error('channel closed');
        if (o.paused) {
          await sleep(200);
          continue;
        }
        if (ch.bufferedAmount > HIGH_WATER) {
          await drained(ch);
          continue;
        }
        const buf = await file.slice(pos, pos + chunk).arrayBuffer();
        if (!current()) return;
        ch.send(buf); // throws if the channel closed underneath us
        pos += buf.byteLength;
        if (pos - lastEmit >= EMIT_EVERY) {
          lastEmit = pos;
          this.set(t, { bytes: pos });
        }
      }
      ch.send('EOF');
      this.set(t, { bytes: pos, status: 'verifying' });
    } catch {
      if (current()) this.set(t, { status: 'interrupted' }); // the receiver can resume later
    }
  }

  // ---------- receiver ----------

  accept(id: string) {
    const r = this.in.get(id);
    if (!r) return;
    // Anything still arriving on an old channel is ignored: the sender restarts from exactly r.t.bytes
    r.channel?.close();
    r.channel = undefined;
    this.deps.sendFrame(r.t.peerId, { t: 'file-accept', id, offset: r.t.bytes }); // 0, or the resume point
    this.set(r.t, { status: 'waiting' });
  }

  reject(id: string) {
    const r = this.in.get(id);
    if (!r) return;
    this.deps.sendFrame(r.t.peerId, { t: 'file-reject', id });
    this.set(r.t, { status: 'rejected' });
    this.in.delete(id);
  }

  handleChannel(peerId: string, ch: RTCDataChannel) {
    const r = this.in.get(ch.label.slice('file:'.length));
    // Nobody offered this, or I didn't ask for it
    if (!r || r.t.peerId !== peerId || r.t.status !== 'waiting') {
      ch.close();
      return;
    }
    ch.binaryType = 'arraybuffer';
    r.channel = ch;
    this.set(r.t, { status: 'transferring' });
    ch.onmessage = (e) => {
      if (r.channel !== ch) return;
      if (typeof e.data === 'string') {
        if (e.data === 'EOF') void this.finish(r);
        return;
      }
      const buf = e.data as ArrayBuffer;
      r.chunks.push(buf);
      r.t.bytes += buf.byteLength;
      if (r.t.bytes > r.t.size) {
        this.cancel(r.t.id); // the peer is sending more than it promised
        return;
      }
      if (r.t.bytes - r.lastEmit >= EMIT_EVERY) {
        r.lastEmit = r.t.bytes;
        this.set(r.t, {});
      }
    };
    ch.onclose = () => {
      if (r.channel === ch && ACTIVE.includes(r.t.status)) this.set(r.t, { status: 'interrupted' });
    };
  }

  private async finish(r: In) {
    this.set(r.t, { status: 'verifying' });
    const blob = new Blob(r.chunks, { type: r.t.mime });
    r.chunks = [];
    const ok = blob.size === r.t.size && (await sha256Hex(blob)) === r.t.sha256;
    this.deps.sendFrame(r.t.peerId, { t: 'file-done', id: r.t.id, ok });
    this.set(r.t, ok ? { status: 'done', url: URL.createObjectURL(blob) } : { status: 'failed' });
    const ch = r.channel;
    r.channel = undefined;
    ch?.close();
  }

  // ---------- both sides ----------

  pause(id: string) {
    this.togglePause(id, true);
  }

  resume(id: string) {
    this.togglePause(id, false);
  }

  private togglePause(id: string, paused: boolean) {
    const o = this.out.get(id);
    const r = this.in.get(id);
    const t = o?.t ?? r?.t;
    if (!t) return;
    if (o) o.paused = paused;
    this.deps.sendFrame(t.peerId, { t: paused ? 'file-pause' : 'file-resume', id });
    this.set(t, { status: paused ? 'paused' : 'transferring' });
  }

  cancel(id: string) {
    const o = this.out.get(id);
    const r = this.in.get(id);
    const t = o?.t ?? r?.t;
    if (!t) return;
    if (o) {
      o.cancelled = true;
      o.channel?.close();
    }
    if (r) {
      r.chunks = [];
      r.channel?.close();
    }
    // Nothing was offered yet while hashing, so there's nobody to tell
    if (t.status !== 'hashing') this.deps.sendFrame(t.peerId, { t: 'file-cancel', id });
    this.set(t, { status: 'cancelled' });
  }

  /** The connection to this peer ended: transfers in progress can be resumed once it's back. */
  peerGone(peerId: string) {
    for (const o of this.out.values()) {
      if (o.t.peerId !== peerId || !ACTIVE.includes(o.t.status)) continue;
      o.channel?.close();
      o.channel = undefined;
      this.set(o.t, { status: 'interrupted' });
    }
    for (const r of this.in.values()) {
      if (r.t.peerId !== peerId || !ACTIVE.includes(r.t.status)) continue;
      r.channel?.close();
      r.channel = undefined;
      this.set(r.t, { status: 'interrupted' });
    }
  }

  handleFrame(peerId: string, f: FileFrame) {
    if (typeof f.id !== 'string') return;
    const o = this.out.get(f.id);
    const r = this.in.get(f.id);
    if ((o && o.t.peerId !== peerId) || (r && r.t.peerId !== peerId)) return; // ignore spoofed ids

    switch (f.t) {
      case 'file-offer': {
        if (r || o) return;
        const t: Transfer = {
          id: f.id,
          peerId,
          direction: 'in',
          name: String(f.name).slice(0, 255),
          size: Number(f.size),
          mime: String(f.mime).slice(0, 100),
          sha256: String(f.sha256),
          bytes: 0,
          status: 'offered',
          createdAt: Date.now(),
        };
        if (!(t.size > 0 && t.size <= MAX_FILE)) {
          this.deps.sendFrame(peerId, { t: 'file-reject', id: f.id });
          return;
        }
        this.in.set(t.id, { t, chunks: [], lastEmit: 0 });
        this.set(t, {});
        break;
      }
      case 'file-accept':
        if (o && !o.cancelled && o.t.status !== 'done') void this.pump(o, Math.max(0, Number(f.offset) || 0));
        break;
      case 'file-reject':
        if (o) this.set(o.t, { status: 'rejected' });
        break;
      case 'file-pause':
      case 'file-resume': {
        const paused = f.t === 'file-pause';
        if (o) o.paused = paused;
        const t = (o ?? r)?.t;
        if (t && (t.status === 'transferring' || t.status === 'paused')) {
          this.set(t, { status: paused ? 'paused' : 'transferring' });
        }
        break;
      }
      case 'file-cancel':
        if (o) {
          o.cancelled = true;
          o.channel?.close();
          this.set(o.t, { status: 'cancelled' });
        }
        if (r) {
          r.chunks = [];
          r.channel?.close();
          this.set(r.t, { status: 'cancelled' });
        }
        break;
      case 'file-done':
        if (o) {
          o.channel?.close();
          this.set(o.t, { status: f.ok ? 'done' : 'failed' });
        }
        break;
    }
  }

  /** Frees download links and closes channels; call when signing out. */
  dispose() {
    for (const o of this.out.values()) {
      o.cancelled = true;
      o.channel?.close();
    }
    for (const r of this.in.values()) {
      r.channel?.close();
      if (r.t.url) URL.revokeObjectURL(r.t.url);
    }
    this.out.clear();
    this.in.clear();
  }

  private set(t: Transfer, patch: Partial<Transfer>) {
    Object.assign(t, patch);
    this.deps.onChange({ ...t });
  }
}
