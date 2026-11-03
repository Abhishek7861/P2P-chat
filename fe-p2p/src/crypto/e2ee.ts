import { api } from '../services/api';

// End-to-end encryption for the 24-hour message store.
//
// Each browser has an ECDH P-256 key pair. The private key is created non-extractable and kept in IndexedDB,
// so it never leaves this browser (not even page code can read its bytes). The public key goes to the server.
// To write to someone, both sides derive the same AES-GCM key from their own private key and the other's public
// key (ECDH, then HKDF). The server only ever sees ciphertext.
//
// Limits: one key per user, so a second browser replaces the first and each can only read the messages that
// were encrypted for it. The key is static (no forward secrecy), and the server hands out public keys without
// any way for users to verify them.

export type Sealed = { ciphertext: string; iv: string; senderKey: string; recipientKey: string };

type Keys = { privateKey: CryptoKey; publicKey: string };

const DB = 'peer-keys';
const STORE = 'keys';
const INFO = new TextEncoder().encode('peer-messenger message key v1');

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function createKeys(): Promise<Keys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { privateKey: pair.privateKey, publicKey: b64(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}

/** This user's key pair in this browser, created on first use. */
async function loadKeys(userId: string): Promise<Keys> {
  try {
    const found = await idb<Keys | undefined>('readonly', (s) => s.get(userId));
    if (found) return found;
    const keys = await createKeys();
    await idb('readwrite', (s) => s.put(keys, userId));
    return keys;
  } catch {
    // IndexedDB unavailable (some private windows): encryption still works, but history won't survive a refresh
    return createKeys();
  }
}

// One load-and-publish per user per page. Without this, React's double mount in development could create two
// key pairs at once and leave the server holding a different public key from the one this browser keeps.
const published = new Map<string, Promise<Keys>>();

function keysFor(userId: string) {
  let p = published.get(userId);
  if (!p) {
    p = loadKeys(userId).then(async (k) => {
      await api('/keys/me', { method: 'PUT', body: JSON.stringify({ publicKey: k.publicKey }) });
      return k;
    });
    p.catch(() => published.delete(userId)); // let a later attempt retry
    published.set(userId, p);
  }
  return p;
}

export class E2EE {
  private keys: Promise<Keys>;
  private peerKeys = new Map<string, { key: string; at: number }>();
  private aesKeys = new Map<string, Promise<CryptoKey>>();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.keys = keysFor(userId);
  }

  ready() {
    return this.keys.then(() => undefined);
  }

  /** Someone's current public key, cached for a minute so a key change is picked up soon. */
  private async keyOf(userId: string) {
    const hit = this.peerKeys.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.key;
    const { publicKey } = await api<{ publicKey: string }>(`/keys/${userId}`);
    this.peerKeys.set(userId, { key: publicKey, at: Date.now() });
    return publicKey;
  }

  private aesKey(myPrivate: CryptoKey, theirPublic: string) {
    let key = this.aesKeys.get(theirPublic);
    if (!key) {
      key = (async () => {
        const pub = await crypto.subtle.importKey('raw', unb64(theirPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, myPrivate, 256);
        const hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: INFO },
          hkdf,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );
      })();
      this.aesKeys.set(theirPublic, key);
    }
    return key;
  }

  // The message id and both user ids are authenticated too, so the server can't swap a message between chats
  private aad(id: string, from: string, to: string) {
    return new TextEncoder().encode(`${id}|${from}|${to}`);
  }

  /** Encrypts a message to `to`. Fails if they haven't published a key yet (never logged in since this feature). */
  async seal(id: string, to: string, text: string): Promise<Sealed> {
    const mine = await this.keys;
    const theirs = await this.keyOf(to);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this.aad(id, this.userId, to) },
      await this.aesKey(mine.privateKey, theirs),
      new TextEncoder().encode(text),
    );
    return { ciphertext: b64(ct), iv: b64(iv), senderKey: mine.publicKey, recipientKey: theirs };
  }

  /** Decrypts a stored message, or returns null if it was encrypted for a different browser's key. */
  async open(m: { id: string; from: string; to: string } & Sealed): Promise<string | null> {
    const mine = await this.keys;
    const iSent = m.from === this.userId;
    if ((iSent ? m.senderKey : m.recipientKey) !== mine.publicKey) return null;
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(m.iv), additionalData: this.aad(m.id, m.from, m.to) },
        await this.aesKey(mine.privateKey, iSent ? m.recipientKey : m.senderKey),
        unb64(m.ciphertext),
      );
      return new TextDecoder().decode(pt);
    } catch {
      return null; // tampered with, or not meant for this key
    }
  }
}
