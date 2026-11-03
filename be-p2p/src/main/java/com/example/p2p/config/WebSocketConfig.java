package com.example.p2p.config;

import com.example.p2p.auth.JwtHandshakeInterceptor;
import com.example.p2p.session.SignalingHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {
    private final SignalingHandler handler;
    private final JwtHandshakeInterceptor auth;

    @Value("${app.cors-origins}")
    private String[] origins;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/signal").addInterceptors(auth).setAllowedOrigins(origins);
    }

    @Bean
    public ServletServerContainerFactoryBean wsContainer() {
        var c = new ServletServerContainerFactoryBean();
        c.setMaxTextMessageBufferSize(64 * 1024);   // SDP is a few KB; reject anything huge
        c.setMaxSessionIdleTimeout(120_000L);       // client pings every 25 s
        return c;
    }
}
