package com.example.p2p.dbo.contact;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
public record ContactId(
        @Column(name = "owner_id") UUID ownerId,
        @Column(name = "contact_id") UUID contactId) implements Serializable
{}