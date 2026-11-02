package com.example.p2p.controllers;

import com.example.p2p.auth.JwtService;
import com.example.p2p.dbo.user.User;
import com.example.p2p.dbo.user.UserRepository;
import com.example.p2p.dto.AuthResponse;
import com.example.p2p.dto.LoginRequest;
import com.example.p2p.dto.RegisterRequest;
import com.example.p2p.dto.UserDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        if (users.existsByUsernameIgnoreCase(req.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username taken");
        }
        User u = new User();
        u.setUsername(req.username());
        u.setDisplayName(req.displayName().strip());
        u.setPasswordHash(encoder.encode(req.password()));
        users.save(u);
        return new AuthResponse(jwt.issue(u), UserDto.of(u));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        User u = users.findByUsernameIgnoreCase(req.username())
                .filter(x -> encoder.matches(req.password(), x.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bad credentials"));
        return new AuthResponse(jwt.issue(u), UserDto.of(u));
    }
}
