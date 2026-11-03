package com.example.p2p.auth;

import com.example.p2p.dbo.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Creates and checks the JWTs used to sign in. Tokens are signed with HMAC using app.jwt.secret,
 * so only this server can create valid ones, and they expire after app.jwt.ttl.
 * Nothing is stored server-side: a token stays valid until it expires (there is no logout on the server).
 */
@Service
public class JwtService {
    private final SecretKey key;
    private final Duration ttl;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.ttl}") Duration ttl) {
        // Fails at startup if the secret is shorter than 32 bytes (256 bits)
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttl = ttl;
    }

    /** Returns a signed token whose subject is the user's id, with the username as an extra claim. */
    public String issue(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key)   // algorithm (HS256/384/512) is picked from the key length
                .compact();
    }

    /**
     * Throws JwtException if the token is invalid or expired.
     */
    public AuthUser verify(String token) {
        // Checks the signature and expiry, then reads the claims written by issue()
        Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        return new AuthUser(UUID.fromString(c.getSubject()), c.get("username", String.class));
    }
}
