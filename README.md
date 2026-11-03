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

## Sharing it over the internet (Cloudflare quick tunnel)

A quick tunnel gives your local app a temporary public `https://….trycloudflare.com` address, with no Cloudflare account needed. Only the frontend port is exposed; Vite forwards `/api` and `/ws` to the backend.

1. Create `infrastructure/.env` with a real JWT secret and the tunnel origins. The default secret is in this repo, so anyone could forge logins with it:

   ```bash
   cd infrastructure
   printf 'JWT_SECRET=%s\nCORS_ORIGINS=http://localhost:5173,https://*.trycloudflare.com\n' "$(openssl rand -base64 48)" > .env
   ```

   Changing the secret signs everyone out once.

2. Start (or restart) the stack so it picks up `.env`:

   ```bash
   docker compose up -d --build
   ```

3. Start the tunnel (install with `brew install cloudflared` if needed) and open the `https://….trycloudflare.com` address it prints:

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

The address changes every time you start the tunnel; the wildcard in `CORS_ORIGINS` covers any of them. Stop the tunnel with Ctrl+C to take the app offline.

Things to know:
- HTTPS from the tunnel means microphones work on other devices too.
- Chat, files and calls still connect browser to browser. Two devices on very different networks (for example, mobile data behind strict NAT) may stay on "Connecting…" until a TURN server is added (Phase 8 of the tutorial).
- This serves the Vite development server, which is fine for demos but not built for heavy traffic.

## Running tests

The backend test needs PostgreSQL running on `localhost:5432`:

```bash
cd be-p2p && ./mvnw test
```
