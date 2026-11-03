package com.example.p2p.dto;

import jakarta.validation.constraints.NotBlank;

/** Body of POST /api/auth/login. Only checks that both fields are filled in; the controller checks the password. */
public record LoginRequest(@NotBlank String username, @NotBlank String password) {}