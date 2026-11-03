package com.example.p2p.auth;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Runs once per request and signs the caller in if it sends {@code Authorization: Bearer <jwt>}.
 * It never rejects a request itself: SecurityConfig decides which paths need a signed-in user.
 * Registered in SecurityConfig, not as a Spring bean, so it only runs inside the security chain.
 */
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    @Override
    protected void doFilterInternal(
            HttpServletRequest req,
            @NonNull HttpServletResponse res,
            @NonNull FilterChain chain) throws ServletException, IOException {

        String header = req.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            try {
                AuthUser user = jwt.verify(header.substring(7));   // 7 = length of "Bearer "
                // Principal is the AuthUser, no credentials, no roles (the app has none yet)
                var auth = new UsernamePasswordAuthenticationToken(user,
                        null, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException ignored) {
                // invalid token: continue unauthenticated, the security chain returns 401
            }
        }
        chain.doFilter(req, res);
    }
}
