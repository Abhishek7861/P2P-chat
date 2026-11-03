package com.example.p2p.dbo.contact;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.UUID;

/**
 * Composite primary key of a contact: who added (ownerId) and who was added (contactId).
 * A record gives the equals/hashCode JPA needs for ids; Serializable is also required for ids.
 */
@Embeddable
public record ContactId(
        @Column(name = "owner_id") UUID ownerId,
        @Column(name = "contact_id") UUID contactId) implements Serializable
{}