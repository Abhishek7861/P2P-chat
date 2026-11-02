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

@RestController
@RequestMapping("/api/contacts")
@RequiredArgsConstructor
public class ContactController {
    private final ContactRepository contacts;
    private final UserRepository users;

    @GetMapping
    public List<UserDto> list(@AuthenticationPrincipal AuthUser me) {
        var ids = contacts.findByIdOwnerId(me.id()).stream().map(c -> c.getId().contactId()).toList();
        return users.findAllById(ids).stream().map(UserDto::of).toList();
    }

    public record AddContact(@NotBlank String username) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto add(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody AddContact body) {
        User other = users.findByUsernameIgnoreCase(body.username()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        if (other.getId().equals(me.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        contacts.save(new Contact(new ContactId(me.id(), other.getId())));
        return UserDto.of(other);
    }

    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AuthUser me, @PathVariable UUID userId) {
        contacts.deleteById(new ContactId(me.id(), userId));
    }
}
