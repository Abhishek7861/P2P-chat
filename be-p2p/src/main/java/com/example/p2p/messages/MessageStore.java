package com.example.p2p.messages;

import com.example.p2p.dto.StoredMessageDto;
import com.example.p2p.session.UserNotifier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The 24-hour store of end-to-end encrypted messages, and the public key directory the browsers encrypt with.
 * Nothing here can read a message: it stores ciphertext and hands it back to the two people in the conversation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageStore {
    public static final Duration KEEP_FOR = Duration.ofHours(24);
    private static final int MAX_RETURNED = 2000;

    private final JdbcTemplate jdbc;
    private final UserNotifier notifier;

    // ---------- public keys ----------

    public void saveKey(UUID user, String publicKey) {
        jdbc.update("""
                INSERT INTO user_keys (user_id, public_key) VALUES (?, ?)
                ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = now()""",
                user, publicKey);
    }

    public Optional<String> keyOf(UUID user) {
        return jdbc.query("SELECT public_key FROM user_keys WHERE user_id = ?",
                (rs, i) -> rs.getString(1), user).stream().findFirst();
    }

    // ---------- messages ----------

    /** Stores a message; false if that id is already taken. Tells the recipient's browser to fetch it. */
    public boolean save(UUID id, UUID from, UUID to, String ciphertext, String iv,
                        String senderKey, String recipientKey, Instant sentAt) {
        int rows = jdbc.update("""
                        INSERT INTO stored_messages
                            (id, sender_id, recipient_id, ciphertext, iv, sender_key, recipient_key, sent_at, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, now() + make_interval(secs => ?))
                        ON CONFLICT (id) DO NOTHING""",
                id, from, to, ciphertext, iv, senderKey, recipientKey, Timestamp.from(sentAt), KEEP_FOR.toSeconds());
        if (rows == 1) notifier.notify(to, Map.of("type", "inbox"));
        return rows == 1;
    }

    /**
     * Everything I sent or received in the last 24 hours, oldest first. Messages to me that hadn't been
     * fetched yet are marked delivered (the response still shows them as new), and their senders are told.
     */
    @Transactional
    public List<StoredMessageDto> fetch(UUID me) {
        List<StoredMessageDto> list = jdbc.query("""
                        SELECT id, sender_id, recipient_id, ciphertext, iv, sender_key, recipient_key, sent_at, delivered_at
                        FROM stored_messages
                        WHERE (sender_id = ? OR recipient_id = ?) AND expires_at > now()
                        ORDER BY sent_at DESC
                        LIMIT ?""",
                (rs, i) -> new StoredMessageDto(
                        rs.getObject("id", UUID.class),
                        rs.getObject("sender_id", UUID.class),
                        rs.getObject("recipient_id", UUID.class),
                        rs.getString("ciphertext"),
                        rs.getString("iv"),
                        rs.getString("sender_key"),
                        rs.getString("recipient_key"),
                        rs.getObject("sent_at", OffsetDateTime.class).toInstant().toEpochMilli(),
                        Optional.ofNullable(rs.getObject("delivered_at", OffsetDateTime.class))
                                .map(t -> t.toInstant().toEpochMilli()).orElse(null)),
                me, me, MAX_RETURNED);

        // Delivery receipts, grouped per sender so each gets one event
        Map<UUID, List<UUID>> delivered = new HashMap<>();
        jdbc.query("""
                        UPDATE stored_messages SET delivered_at = now()
                        WHERE recipient_id = ? AND delivered_at IS NULL AND expires_at > now()
                        RETURNING id, sender_id""",
                rs -> {
                    delivered.computeIfAbsent(rs.getObject("sender_id", UUID.class), k -> new ArrayList<>())
                            .add(rs.getObject("id", UUID.class));
                },
                me);
        delivered.forEach((sender, ids) -> notifier.notify(sender, Map.of("type", "receipt", "ids", ids)));

        return list.reversed();
    }

    /** Deletes expired messages. Reads already skip them; this just keeps the table small. */
    @Scheduled(fixedDelay = 10 * 60 * 1000, initialDelay = 60 * 1000)
    public void purgeExpired() {
        int n = jdbc.update("DELETE FROM stored_messages WHERE expires_at <= now()");
        if (n > 0) log.info("Deleted {} expired stored messages", n);
    }
}
