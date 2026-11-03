package com.example.p2p;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point. @SpringBootApplication scans this package and its subpackages for
 * controllers, services and config, and Flyway runs the database migrations at startup.
 * @EnableScheduling runs @Scheduled jobs, such as deleting expired stored messages.
 */
@SpringBootApplication
@EnableScheduling
public class P2pApplication {

	public static void main(String[] args) {
		SpringApplication.run(P2pApplication.class, args);
	}

}
