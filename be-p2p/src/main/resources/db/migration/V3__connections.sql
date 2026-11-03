CREATE TABLE connections (
                             id              BIGSERIAL PRIMARY KEY,
                             session_id      VARCHAR(64) NOT NULL,
                             user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                             remote_addr     VARCHAR(64),
                             connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                             disconnected_at TIMESTAMPTZ
);
CREATE INDEX connections_user_idx ON connections (user_id, connected_at DESC);