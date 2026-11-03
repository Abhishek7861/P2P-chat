package com.example.p2p.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/auth/register. The annotations are checked because the controller marks it @Valid;
 * a failure returns 400 with the field and its message.
 */
public record RegisterRequest(
        // 3 to 32 letters, digits or underscores
        @NotBlank @Pattern(regexp = "^[a-zA-Z0-9_]{3,32}$")
        String username, @NotBlank @Size(max = 64) String displayName,

        @NotBlank @Size(min = 8, max = 72)
        String password
) {}   // bcrypt ignores bytes past 72