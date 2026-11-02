package com.example.p2p.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Pattern(regexp = "^[a-zA-Z0-9_]{3,32}$")
        String username, @NotBlank @Size(max = 64) String displayName,

        @NotBlank @Size(min = 8, max = 72)
        String password
) {}   // bcrypt ignores bytes past 72