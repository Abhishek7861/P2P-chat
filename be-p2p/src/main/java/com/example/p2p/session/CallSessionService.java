package com.example.p2p.session;

import com.example.p2p.dto.CallDto;
import com.example.p2p.dto.UserDto;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * The call log. Every call-* signal passes through the signaling server, so the log is built from what
 * the server relays rather than from what clients report. Each update also checks who sent it, so the
 * callee can't be recorded as the caller and only a participant can end a call.
 */
@Service
@RequiredArgsConstructor
public class CallSessionService {
    private final JdbcTemplate jdbc;

    /** Records a relayed signal if it's a call signal. delivered = false when the target was offline. */
    public void track(UUID from, UUID to, JsonNode p, boolean delivered) {
        String kind = p.path("kind").asText();
        if (!kind.startsWith("call-")) return;
        UUID callId;
        try {
            callId = UUID.fromString(p.path("callId").asText());
        } catch (IllegalArgumentException e) {
            return;
        }

        switch (kind) {
            // ON CONFLICT: a reused call id can't overwrite someone else's call
            case "call-invite" -> jdbc.update("""
                            INSERT INTO call_sessions (id, caller_id, callee_id, media, status)
                            VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING""",
                    callId, from, to, "video".equals(p.path("media").asText()) ? "video" : "audio",
                    delivered ? "ringing" : "missed");
            case "call-accept" -> jdbc.update("""
                            UPDATE call_sessions SET status = 'active', answered_at = now()
                            WHERE id = ? AND callee_id = ? AND status = 'ringing'""",
                    callId, from);
            case "call-decline", "call-busy" -> jdbc.update("""
                            UPDATE call_sessions SET status = 'declined', ended_at = now()
                            WHERE id = ? AND callee_id = ? AND status = 'ringing'""",
                    callId, from);
            // Ending while it still rings (cancel or no answer) counts as missed
            case "call-end" -> jdbc.update("""
                            UPDATE call_sessions
                            SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE 'ended' END, ended_at = now()
                            WHERE id = ? AND (caller_id = ? OR callee_id = ?) AND ended_at IS NULL""",
                    callId, from, from);
            default -> { }
        }
    }

    /**
     * Closes any calls still open for a user who just went offline, so a crashed tab or lost network doesn't
     * leave a call "in progress" forever. A brief signaling drop during a call also lands here; the audio
     * keeps flowing peer to peer, but the log records the call as ended at that moment.
     */
    public void endOpenCalls(UUID user) {
        jdbc.update("""
                        UPDATE call_sessions
                        SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE 'ended' END, ended_at = now()
                        WHERE (caller_id = ? OR callee_id = ?) AND ended_at IS NULL""",
                user, user);
    }

    /** My last 50 calls, newest first, each with the other person's details. */
    public List<CallDto> history(UUID me) {
        return jdbc.query("""
                        SELECT c.id, c.caller_id, c.media, c.status, c.created_at, c.answered_at, c.ended_at,
                               u.id AS peer_id, u.username, u.display_name
                        FROM call_sessions c
                        JOIN users u ON u.id = CASE WHEN c.caller_id = ? THEN c.callee_id ELSE c.caller_id END
                        WHERE c.caller_id = ? OR c.callee_id = ?
                        ORDER BY c.created_at DESC
                        LIMIT 50""",
                (rs, i) -> new CallDto(
                        rs.getObject("id", UUID.class),
                        new UserDto(rs.getObject("peer_id", UUID.class), rs.getString("username"), rs.getString("display_name")),
                        me.equals(rs.getObject("caller_id", UUID.class)),
                        rs.getString("media"),
                        rs.getString("status"),
                        instant(rs.getObject("created_at", OffsetDateTime.class)),
                        instant(rs.getObject("answered_at", OffsetDateTime.class)),
                        instant(rs.getObject("ended_at", OffsetDateTime.class))),
                me, me, me);
    }

    private static Instant instant(OffsetDateTime t) {
        return t == null ? null : t.toInstant();
    }
}
