package com.example.p2p.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One call in my history. outgoing = I placed it; peer is the other person.
 * status is ringing, active, declined, missed or ended; answeredAt and endedAt are null until those happen.
 */
public record CallDto(
        UUID id, UserDto peer, boolean outgoing, String media, String status,
        Instant createdAt, Instant answeredAt, Instant endedAt) {}
