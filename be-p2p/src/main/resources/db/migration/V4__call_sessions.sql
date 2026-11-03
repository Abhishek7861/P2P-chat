-- One row per call. The server fills it in from the call-* signals it relays, so clients can't misreport calls.
-- status: ringing | active | declined | missed | ended
CREATE TABLE call_sessions (
    id          UUID PRIMARY KEY,
    caller_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media       VARCHAR(8)  NOT NULL CHECK (media IN ('audio', 'video')),
    status      VARCHAR(12) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ
);
CREATE INDEX call_sessions_caller_idx ON call_sessions (caller_id, created_at DESC);
CREATE INDEX call_sessions_callee_idx ON call_sessions (callee_id, created_at DESC);
