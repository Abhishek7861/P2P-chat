// Every frame on the `chat` data channel is a small JSON object. A message has an id so the receiver can acknowledge it.
export type ChatFrame =
  | { t: 'msg'; id: string; text: string; sentAt: number }
  | { t: 'ack'; id: string; receivedAt: number };

// Status of my own messages: queued (channel not open yet) → sent (handed to the channel) → delivered (ack came back).
export type ChatMessage = {
  id: string;
  from: 'me' | 'them';
  text: string;
  sentAt: number;
  status: 'queued' | 'sent' | 'delivered' | 'received';
};

export const MAX_TEXT = 4000;
