package com.example.p2p.controllers;

import com.example.p2p.auth.AuthUser;
import com.example.p2p.dbo.user.User;
import com.example.p2p.dbo.user.UserRepository;
import com.example.p2p.dto.UserDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** The signed-in user's profile, and searching for other users to add as contacts. */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserRepository users;

    /** GET /api/users/me: my profile. The frontend calls it on load to check a saved token still works. */
    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal AuthUser me) {
        // A valid token for a user that no longer exists is treated as signed out
        return users.findById(me.id()).map(UserDto::of)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    /** Request body for changing my display name. */
    public record UpdateProfile(@NotBlank @Size(max = 64) String displayName) {
    }

    /** PATCH /api/users/me: changes my display name. */
    @PatchMapping("/me")
    @Transactional
    public UserDto update(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody UpdateProfile body) {
        User u = users.findById(me.id()).orElseThrow();
        // No save() needed: inside the transaction, Hibernate writes the changed field on commit
        u.setDisplayName(body.displayName().strip());
        return UserDto.of(u);
    }

    /**
     * GET /api/users/search?q=...: up to 20 users whose username or display name contains q, ignoring case.
     * I am left out of the results, so there can be 19.
     */
    @GetMapping("/search")
    public List<UserDto> search(@AuthenticationPrincipal AuthUser me, @RequestParam @Size(min = 2, max = 32) String
            q) {
        // Spring MVC checks @Size itself and returns 400 if q is too short or too long
        return users.findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(q, q).stream()
                .filter(u -> !u.getId().equals(me.id())).map(UserDto::of).toList();
    }


}
