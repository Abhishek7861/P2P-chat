package com.example.p2p.controllers;

import com.example.p2p.auth.AuthUser;
import com.example.p2p.dto.CallDto;
import com.example.p2p.session.CallSessionService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The signed-in user's call history, recorded by the signaling server. */
@RestController
@RequestMapping("/api/calls")
@RequiredArgsConstructor
public class CallController {
    private final CallSessionService calls;

    /** GET /api/calls: my last 50 calls, newest first. */
    @GetMapping
    public List<CallDto> history(@AuthenticationPrincipal AuthUser me) {
        return calls.history(me.id());
    }
}
