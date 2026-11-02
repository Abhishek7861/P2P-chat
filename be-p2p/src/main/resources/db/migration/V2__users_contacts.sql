CREATE TABLE users (
                       id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       username      VARCHAR(32)  NOT NULL,
                       display_name  VARCHAR(64)  NOT NULL,
                       password_hash VARCHAR(100) NOT NULL,
                       created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_uq ON users (lower(username));

CREATE TABLE contacts (
                          owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                          contact_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                          PRIMARY KEY (owner_id, contact_id),
                          CHECK (owner_id <> contact_id)
);

CREATE TABLE devices (
                         id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                         user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                         name         VARCHAR(64) NOT NULL,
                         last_seen_at TIMESTAMPTZ,
                         created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);