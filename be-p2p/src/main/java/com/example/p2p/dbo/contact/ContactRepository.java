package com.example.p2p.dbo.contact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Database access for contacts. Spring Data writes the implementation from the method names. */
public interface ContactRepository extends JpaRepository<Contact, ContactId> {
    /** All contacts added by this user ("IdOwnerId" means the ownerId field inside id). */
    List<Contact> findByIdOwnerId(UUID ownerId);
    List<Contact> findByIdContactId(UUID contactId);
}
