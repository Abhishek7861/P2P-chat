package com.example.p2p.dbo.contact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ContactRepository extends JpaRepository<Contact, ContactId> {
    List<Contact> findByIdOwnerId(UUID ownerId);
}
