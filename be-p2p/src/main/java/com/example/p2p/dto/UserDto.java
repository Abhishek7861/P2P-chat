package com.example.p2p.dto;

import com.example.p2p.dbo.user.User;

import java.util.UUID;

/**
 * What the API shows about a user. Controllers return this instead of the User entity,
 * so the password hash and other internal fields are never sent.
 */
public record UserDto(
        UUID id, String username, String displayName) {
    public static UserDto of(User u) {
        return new UserDto(u.getId(), u.getUsername(), u.getDisplayName());
    }
}