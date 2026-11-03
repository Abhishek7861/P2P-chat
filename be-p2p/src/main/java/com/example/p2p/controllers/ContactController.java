package com.example.p2p.controllers;

import com.example.p2p.auth.AuthUser;
import com.example.p2p.dbo.contact.Contact;
import com.example.p2p.dbo.contact.ContactId;
import com.example.p2p.dbo.contact.ContactRepository;
import com.example.p2p.dbo.user.User;
import com.example.p2p.dbo.user.UserRepository;
import com.example.p2p.dto.UserDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * The signed-in user's contact list. Contacts are one-way: when Alice adds Bob,
 * Bob is in Alice's list but Alice is not in Bob's until he adds her too.
 */
@RestController
@RequestMapping("/api/contacts")
@RequiredArgsConstructor
public class ContactController {
    private final ContactRepository contacts;
    private final UserRepository users;

    /** GET /api/contacts: the users I have added. */
    @GetMapping
    public List<UserDto> list(@AuthenticationPrincipal AuthUser me) {
        // Two queries: my contact rows give the user ids, then load those users
        var ids = contacts.findByIdOwnerId(me.id()).stream().map(c -> c.getId().contactId()).toList();
        return users.findAllById(ids).stream().map(UserDto::of).toList();
    }

    /** Request body for adding a contact by username. */
    public record AddContact(@NotBlank String username) {
    }

    /** POST /api/contacts: adds a user by username (404 if no such user, 400 if it's me). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto add(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody AddContact body) {
        User other = users.findByUsernameIgnoreCase(body.username()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        if (other.getId().equals(me.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        // Adding someone twice is harmless: the id already exists, so save() updates the row instead of inserting
        contacts.save(new Contact(new ContactId(me.id(), other.getId())));
        return UserDto.of(other);
    }

    /** DELETE /api/contacts/{userId}: removes that user from my list; does nothing if they aren't in it. */
    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AuthUser me, @PathVariable UUID userId) {
        contacts.deleteById(new ContactId(me.id(), userId));
    }
}
