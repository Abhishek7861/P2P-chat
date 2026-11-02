package com.example.p2p.dto;

import com.example.p2p.dbo.user.User;

import java.util.UUID;

public record UserDto(
        UUID id, String username, String displayName) {
    public static UserDto of(User u) {
        return new UserDto(u.getId(), u.getUsername(), u.getDisplayName());
    }
}