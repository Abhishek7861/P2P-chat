package com.example.p2p.dbo.contact;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * One row of the contacts table: "owner added contact". The row has no id column of its own;
 * the (owner, contact) pair is the primary key, so the same pair can't be stored twice.
 */
@Entity
@Table(name = "contacts") @Getter
@NoArgsConstructor   // JPA needs a no-args constructor to load rows
public class Contact {
    @EmbeddedId
    private ContactId id;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Contact(ContactId id) { this.id = id; }
}

