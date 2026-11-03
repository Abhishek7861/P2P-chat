package com.example.p2p.config;

import com.example.p2p.auth.JwtAuthFilter;
import com.example.p2p.auth.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Security setup for the REST API: every request carries its own JWT, the server keeps no session,
 * and every path except the public ones below needs a valid token.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtService jwt, @Value("${app.cors-origins}") List<String> origins) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)   // stateless API, token in header, no cookies
                .cors(c -> c.configurationSource(cors(origins)))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        // /error must stay public, or Spring's error page for a real error is replaced by an empty 401
                        .requestMatchers("/api/auth/**", "/api/ping", "/actuator/health", "/error").permitAll()
                        .requestMatchers("/ws/**").permitAll()   // authenticated in the WS handshake (Phase 3)
                        .anyRequest().authenticated())
                // No token or a bad token: plain 401, instead of a login page or a Basic auth prompt
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                // Read the JWT early in the chain, before Spring's own login filters would run
                .addFilterBefore(new JwtAuthFilter(jwt), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Hashes passwords with bcrypt (salted and deliberately slow); used at register and login. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** Lets the frontend origins in app.cors-origins call the API from the browser. */
    private CorsConfigurationSource cors(List<String> origins) {
        var cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        var src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", cfg);
        return src;
    }
}
