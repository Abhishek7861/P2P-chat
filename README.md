# P2P Messenger

A peer-to-peer messaging app, in early development. So far it is a working scaffold: a React frontend calls a Spring Boot backend backed by PostgreSQL. Messaging features are not built yet.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Backend | Java 21, Spring Boot 4, Spring Data JPA, WebSocket starter |
| Database | PostgreSQL 16, Flyway migrations |
| Infrastructure | Docker Compose |

## Project structure

```
be-p2p/           Spring Boot backend
fe-p2p/           React frontend
infrastructure/   Docker Compose setup and example environment file
docs/             Design docs (to be written)
```

## Getting started

You need Docker with Docker Compose. From the project root, run:

```bash
docker compose -f infrastructure/docker-compose.yml up --build
```

Then open:

| URL | What it shows |
| --- | --- |
| http://localhost:5173 | Frontend, which displays the API status |
| http://localhost:8080/api/ping | Backend ping endpoint |
| http://localhost:8080/actuator/health | Backend health check |

The default settings are for local development only. To override them, copy `infrastructure/.env.example` to `infrastructure/.env` and edit the values.

## Running tests

The backend test needs PostgreSQL running on `localhost:5432`:

```bash
cd be-p2p && ./mvnw test
```
