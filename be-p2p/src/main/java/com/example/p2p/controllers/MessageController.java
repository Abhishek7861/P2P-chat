package com.example.p2p.controllers;

import com.example.p2p.auth.AuthUser;
import com.example.p2p.dbo.contact.ContactId;
import com.example.p2p.dbo.contact.ContactRepository;
import com.example.p2p.dto.StoredMessageDto;
import com.example.p2p.messages.MessageStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * End-to-end encrypted message storage (kept 24 hours) and the public key directory browsers encrypt with.
 * Every value here is opaque to the server: keys and ciphertext are only checked for shape and size.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MessageController {
    private static final int MAX_CIPHERTEXT_BYTES = 20_000; // a 4000-character message is at most ~16 KB of UTF-8

    private final MessageStore store;
    private final ContactRepository contacts;

    public record PublicKey(@NotBlank @Size(max = 128) String publicKey) {
    }

    /** PUT /api/keys/me: publish this browser's public key (replaces any earlier one). */
    @PutMapping("/keys/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void putKey(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody PublicKey body) {
        requireKey(body.publicKey());
        store.saveKey(me.id(), body.publicKey());
    }

    /** GET /api/keys/{userId}: someone's public key, to encrypt a message to them. 404 if they have none yet. */
    @GetMapping("/keys/{userId}")
    public Map<String, Object> getKey(@PathVariable UUID userId) {
        return store.keyOf(userId)
                .<Map<String, Object>>map(k -> Map.of("userId", userId, "publicKey", k))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No key for that user yet"));
    }

    public record NewMessage(
            @NotNull UUID id,
            @NotNull UUID to,
            @NotBlank @Size(max = 30_000) String ciphertext,
            @NotBlank @Size(max = 24) String iv,
            @NotBlank @Size(max = 128) String senderKey,
            @NotBlank @Size(max = 128) String recipientKey,
            long sentAt) {
    }

    /** POST /api/messages: store an encrypted message for 24 hours. Only to someone in my contacts. */
    @PostMapping("/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public void post(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody NewMessage m) {
        if (!contacts.existsById(new ContactId(me.id(), m.to()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only store messages for your contacts");
        }
        if (decode(m.ciphertext()).length > MAX_CIPHERTEXT_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Message too large");
        }
        if (decode(m.iv()).length != 12) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad iv");
        requireKey(m.senderKey());
        requireKey(m.recipientKey());

        // Trust the client's clock for display, but not by more than a day either way
        Instant now = Instant.now();
        Instant sentAt = Instant.ofEpochMilli(m.sentAt());
        if (Duration.between(sentAt, now).abs().compareTo(Duration.ofDays(1)) > 0) sentAt = now;

        if (!store.save(m.id(), me.id(), m.to(), m.ciphertext(), m.iv(), m.senderKey(), m.recipientKey(), sentAt)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Message id already used");
        }
    }

    /** GET /api/messages: everything I sent or received in the last 24 hours, oldest first. */
    @GetMapping("/messages")
    public List<StoredMessageDto> list(@AuthenticationPrincipal AuthUser me) {
        return store.fetch(me.id());
    }

    // A raw uncompressed P-256 public key is 65 bytes starting with 0x04
    private static void requireKey(String b64) {
        byte[] k = decode(b64);
        if (k.length != 65 || k[0] != 4) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad public key");
    }

    private static byte[] decode(String b64) {
        try {
            return Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not base64");
        }
    }
}
