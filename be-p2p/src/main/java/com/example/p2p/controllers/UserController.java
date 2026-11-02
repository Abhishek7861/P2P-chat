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

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserRepository users;

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal AuthUser me) {
        return users.findById(me.id()).map(UserDto::of)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    public record UpdateProfile(@NotBlank @Size(max = 64) String displayName) {
    }

    @PatchMapping("/me")
    @Transactional
    public UserDto update(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody UpdateProfile body) {
        User u = users.findById(me.id()).orElseThrow();
        u.setDisplayName(body.displayName().strip());
        return UserDto.of(u);
    }

    @GetMapping("/search")
    public List<UserDto> search(@AuthenticationPrincipal AuthUser me, @RequestParam @Size(min = 2, max = 32) String
            q) {
        return users.findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(q, q).stream()
                .filter(u -> !u.getId().equals(me.id())).map(UserDto::of).toList();
    }


}
