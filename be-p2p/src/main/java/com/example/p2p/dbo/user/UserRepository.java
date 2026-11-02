package com.example.p2p.dbo.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> { Optional<User> findByUsernameIgnoreCase(String username);
    boolean existsByUsernameIgnoreCase(String username);
    List<User> findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(String u, String d);
}
