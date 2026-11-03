package com.example.p2p.auth;

import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class JwtHandshakeInterceptor implements HandshakeInterceptor {
    private final JwtService jwt;

    @Override
    public boolean beforeHandshake(ServerHttpRequest req,
                                   @NonNull ServerHttpResponse res,
                                   @NonNull WebSocketHandler handler,
                                   @NonNull Map<String, Object> attrs) {

        String token = UriComponentsBuilder
                .fromUri(req.getURI()).build()
                .getQueryParams().getFirst("token");

        try {
            if (token == null) throw new IllegalArgumentException("missing token");
            attrs.put("user", jwt.verify(token));
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            res.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(@NonNull ServerHttpRequest request,
                               @NonNull ServerHttpResponse response,
                               @NonNull WebSocketHandler wsHandler,
                               @Nullable Exception exception) {
    }
}
