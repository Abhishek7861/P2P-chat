package com.example.p2p.dto;

/** Response of register and login: the JWT to send on later requests, and who signed in. */
public record AuthResponse(String token, UserDto user) {}