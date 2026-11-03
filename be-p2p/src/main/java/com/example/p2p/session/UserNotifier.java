package com.example.p2p.session;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.UUID;

/**
 * Pushes a JSON event down a user's signaling WebSocket, if they're connected. Lets REST endpoints tell a
 * browser something changed (a stored message arrived, a message was delivered) without it polling.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserNotifier {
    private final SessionRegistry registry;
    private final ObjectMapper json;

    public void notify(UUID userId, Object event) {
        // Registered sessions are ConcurrentWebSocketSessionDecorators, so sending from this thread is safe
        registry.get(userId).ifPresent(s -> {
            try {
                s.sendMessage(new TextMessage(json.writeValueAsString(event)));
            } catch (IOException | IllegalStateException e) {
                log.debug("notify failed for {}: {}", userId, e.getMessage());
            }
        });
    }
}
