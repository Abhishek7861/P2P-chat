package com.example.p2p;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point. @SpringBootApplication scans this package and its subpackages for
 * controllers, services and config, and Flyway runs the database migrations at startup.
 */
@SpringBootApplication
public class P2pApplication {

	public static void main(String[] args) {
		SpringApplication.run(P2pApplication.class, args);
	}

}
