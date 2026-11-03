package com.example.p2p.session;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionRegistry {
    private final Map<UUID, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /**
     * @return the session this one replaced, or null
     */
    public WebSocketSession register(UUID userId, WebSocketSession s) {
        return sessions.put(userId, s);
    }

    /**
     * @return true if s was the current session (i.e. the user is now offline)
     */
    public boolean unregister(UUID userId, WebSocketSession s) {
        return sessions.remove(userId, s);
    }

    public Optional<WebSocketSession> get(UUID userId) {
        return Optional.ofNullable(sessions.get(userId));
    }

    public boolean isOnline(UUID userId) {
        return sessions.containsKey(userId);
    }

    public int size() {
        return sessions.size();
    }
}
