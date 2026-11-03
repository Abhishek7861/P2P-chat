package com.example.p2p.session;

import com.example.p2p.auth.AuthUser;
import com.example.p2p.dbo.contact.ContactRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class SignalingHandler extends TextWebSocketHandler {
    private static final String SAFE = "safe";

    private final SessionRegistry registry;
    private final ContactRepository contacts;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) throws IOException {
        AuthUser me = user(raw);
        var safe = new ConcurrentWebSocketSessionDecorator(raw, 5_000, 512 * 1024);
        raw.getAttributes().put(SAFE, safe);

        WebSocketSession previous = registry.register(me.id(), safe);
        if (previous != null) previous.close(new CloseStatus(4000, "Replaced by a newer connection"));

        jdbc.update("INSERT INTO connections (session_id, user_id, remote_addr) VALUES (?, ?, ?)",
                raw.getId(), me.id(), String.valueOf(raw.getRemoteAddress()));

        List<UUID> online = contacts.findByIdOwnerId(me.id()).stream()
                .map(c -> c.getId().contactId()).filter(registry::isOnline).toList();
        send(safe, Map.of("type", "presence-snapshot", "online", online));
        if (previous == null) broadcastPresence(me.id(), true);
    }

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) throws IOException {
        AuthUser me = user(raw);
        JsonNode msg = json.readTree(message.getPayload());
        switch (msg.path("type").asText()) {
            case "ping" -> send(safe(raw), Map.of("type", "pong"));
            case "signal" -> relay(me, safe(raw), msg);
            default -> send(safe(raw), Map.of("type", "error", "code", "unknown-type"));
        }
    }

    private void relay(AuthUser me, WebSocketSession from, JsonNode msg) {
        UUID to;
        try {
            to = UUID.fromString(msg.path("to").asText());
        } catch (IllegalArgumentException e) {
            send(from, Map.of("type", "error", "code", "bad-target"));
            return;
        }
        JsonNode payload = msg.get("payload");
        if (payload == null || !payload.isObject()) {
            send(from, Map.of("type", "error", "code", "bad-payload"));
            return;
        }

        registry.get(to).ifPresentOrElse(
                target -> send(target, Map.of("type", "signal", "from", me.id(), "payload", payload)),
                () -> send(from, Map.of("type", "error", "code", "peer-offline", "to", to)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
        AuthUser me = user(raw);
        jdbc.update("UPDATE connections SET disconnected_at = now() WHERE session_id = ?", raw.getId());
        if (registry.unregister(me.id(), safe(raw))) broadcastPresence(me.id(), false);
    }

    private void broadcastPresence(UUID userId, boolean online) {
        var event = Map.of("type", "presence", "userId", userId, "online", online);
        contacts.findByIdContactId(userId).forEach(c ->
                registry.get(c.getId().ownerId()).ifPresent(s -> send(s, event)));
    }

    private void send(WebSocketSession s, Object body) {
        try {
            s.sendMessage(new TextMessage(json.writeValueAsString(body)));
        } catch (IOException | IllegalStateException e) {
            log.debug("send failed to {}: {}", s.getId(), e.getMessage());
        }
    }

    private static AuthUser user(WebSocketSession s) {
        return (AuthUser) s.getAttributes().get("user");
    }

    private static WebSocketSession safe(WebSocketSession raw) {
        return (WebSocketSession) raw.getAttributes().get(SAFE);
    }

}
