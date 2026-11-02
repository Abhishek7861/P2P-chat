package com.example.p2p.dbo.contact;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "contacts") @Getter
@NoArgsConstructor
public class Contact {
    @EmbeddedId
    private ContactId id;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Contact(ContactId id) { this.id = id; }
}

