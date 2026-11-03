package com.example.p2p.dbo.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Database access for users. Spring Data builds each query from the method name,
 * e.g. findByUsernameIgnoreCase becomes {@code WHERE upper(username) = upper(?)}.
 */
public interface UserRepository extends JpaRepository<User, UUID> { Optional<User> findByUsernameIgnoreCase(String username);
    boolean existsByUsernameIgnoreCase(String username);

    /** First 20 users whose username contains u or whose display name contains d, ignoring case (used by search). */
    List<User> findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(String u, String d);
}
