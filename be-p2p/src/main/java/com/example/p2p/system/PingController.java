package com.example.p2p.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/** Public GET /api/ping, a quick way to check the API is up and reachable from the frontend. */
@RestController
@RequestMapping("/api")
public class PingController {
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("status", "ok", "time", Instant.now().toString());
    }
}
