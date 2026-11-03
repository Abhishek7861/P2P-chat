package com.example.p2p.auth;

import java.util.UUID;

/**
 * The signed-in user for the current request, built from the JWT alone (no database lookup).
 * Controllers receive it with {@code @AuthenticationPrincipal AuthUser me}.
 */
public record AuthUser(UUID id, String username) {}