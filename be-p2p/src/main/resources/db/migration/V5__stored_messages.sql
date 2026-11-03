-- Each browser's public key (P-256, raw, base64). The matching private key never leaves the browser.
-- One per user: logging in on another browser replaces it.
CREATE TABLE user_keys (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public_key VARCHAR(128) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- End-to-end encrypted copies of chat messages, kept for 24 hours so they survive a refresh and reach
-- people who were offline. The server can see who wrote to whom and when, but not the text.
-- sender_key and recipient_key are the public keys the message was encrypted for, so it can still be
-- decrypted after the other person's key changes.
CREATE TABLE stored_messages (
    id            UUID PRIMARY KEY,
    sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ciphertext    TEXT NOT NULL,
    iv            VARCHAR(24)  NOT NULL,
    sender_key    VARCHAR(128) NOT NULL,
    recipient_key VARCHAR(128) NOT NULL,
    sent_at       TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    delivered_at  TIMESTAMPTZ
);
CREATE INDEX stored_messages_recipient_idx ON stored_messages (recipient_id, sent_at);
CREATE INDEX stored_messages_sender_idx ON stored_messages (sender_id, sent_at);
CREATE INDEX stored_messages_expires_idx ON stored_messages (expires_at);
