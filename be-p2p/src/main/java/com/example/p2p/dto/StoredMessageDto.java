package com.example.p2p.dto;

import java.util.UUID;

/**
 * An encrypted message from the 24-hour store. Only the two browsers can decrypt ciphertext.
 * sentAt and deliveredAt are epoch milliseconds; deliveredAt is null until the recipient first fetched it.
 */
public record StoredMessageDto(
        UUID id, UUID from, UUID to, String ciphertext, String iv, String senderKey, String recipientKey,
        long sentAt, Long deliveredAt) {}
