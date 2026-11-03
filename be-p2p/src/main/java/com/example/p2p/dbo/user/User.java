package com.example.p2p.dbo.user;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A row of the users table. Lombok generates the getters, setters and no-args constructor.
 * The table itself is created by the Flyway migration V2__users_contacts.sql;
 * these annotations must match it, because Hibernate checks them at startup (ddl-auto: validate).
 */
@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)   // Hibernate creates the UUID before inserting
    private UUID id;

    // Stored as typed; the database's unique index on lower(username) blocks case-only duplicates
    @Column(nullable = false, length = 32)
    private String username;

    @Column(name = "display_name", nullable = false, length = 64)
    private String displayName;

    // bcrypt hash, never the password itself; never sent to clients (UserDto leaves it out)
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}


