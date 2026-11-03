# PEER Messenger

A peer-to-peer messaging app, in development. You can create an account, add contacts, see who is online, chat, and send files up to 500 MB. Messages and files go directly between browsers over WebRTC; the Spring Boot backend handles accounts, contacts, presence and connection setup, and never sees message content. Audio and video calls are not built yet.

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
| http://localhost:5173 | The app |
| http://localhost:8080/api/ping | Backend ping endpoint |
| http://localhost:8080/actuator/health | Backend health check |

The default settings are for local development only. To override them, copy `infrastructure/.env.example` to `infrastructure/.env` and edit the values.

## Running tests

The backend test needs PostgreSQL running on `localhost:5432`:

```bash
cd be-p2p && ./mvnw test
```
