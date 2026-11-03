// Every frame on the `chat` data channel is a small JSON object. A message has an id so the receiver can acknowledge it.
export type ChatFrame =
  | { t: 'msg'; id: string; text: string; sentAt: number }
  | { t: 'ack'; id: string; receivedAt: number };

// Status of my own messages: queued (not sent yet) → stored (encrypted copy on the server, they're offline)
// or sent (handed to the direct channel) → delivered (they have it). failed: neither route worked.
export type MessageStatus = 'queued' | 'failed' | 'stored' | 'sent' | 'delivered' | 'received';

export type ChatMessage = {
  id: string;
  from: 'me' | 'them';
  text: string;
  sentAt: number;
  status: MessageStatus;
  /** Received while I was away or during this visit (counts as unread); false for history I'd already seen. */
  isNew?: boolean;
  /** Stored copy encrypted for another browser's key, so this browser can't read it. */
  locked?: boolean;
};

const RANK: Record<MessageStatus, number> = { queued: 0, failed: 0, stored: 1, sent: 2, delivered: 3, received: 3 };

/** Statuses only move forward: a late "stored" mustn't hide a "delivered" that already arrived. */
export const laterStatus = (current: MessageStatus, next: MessageStatus) =>
  RANK[next] > RANK[current] || (next === 'failed' && current === 'queued') ? next : current;

export const MAX_TEXT = 4000;
