# Push Rummy — security notes

This document describes how the server handles auth, exposure, and operational controls. It is not a formal audit.

## Threat model (informal)

- **In scope:** Casual abuse (credential stuffing, DB wipe, oversized payloads), casual MITM on LAN if HTTP is used, JWT forgery if the signing secret leaks.
- **Out of scope (v1):** Professional cheating against the authoritative server, DDoS at scale, or legal/compliance certification.

## Authentication

- Passwords are stored with **bcrypt** (cost factor 10).
- Sessions use **JWT** (`HS256`) with **30-day** expiry. Payload contains `sub` (user id) and `username`.
- Socket events that mutate game or lobby state require a valid JWT and matching `playerId` / `hostId`.

### Production: `JWT_SECRET`

- In **`NODE_ENV=production`**, the server **refuses to start** unless `JWT_SECRET` is set to a value that is **not** the dev default and is **at least 32 characters**.
- Generate one example: `openssl rand -base64 48`
- **Docker:** pass `JWT_SECRET` via environment (see `.env.example` and `docker-compose.yml`). Never commit real secrets.

## CORS and Socket.IO

- **Default (development):** `Access-Control-Allow-Origin: *` for HTTP and sockets. Suitable for LAN testing; any origin can call the API if it can reach the host.
- **Production hardening:** set **`CORS_ORIGIN`** to a comma-separated list of allowed origins (e.g. `https://rummy.example.com,https://www.example.com`). The same list is applied to Socket.IO. Leave unset to keep wildcard behavior.

## HTTP hardening

- **`helmet`** adds standard security headers. **Content-Security-Policy** is disabled because the same process serves the Vite-built SPA; tighten CSP in a future split (static CDN + API-only server) if needed.
- **`express.json`** body limit is **48kb** to limit JSON bomb style payloads on auth routes.
- **Rate limiting:** `POST /auth/register` and `POST /auth/login` share a limiter (default **60 requests / 15 minutes / IP**). Behind a reverse proxy, set **`TRUST_PROXY=1`** so the server trusts `X-Forwarded-For` for the client IP.

## Admin database reset

- **`POST /admin/reset-db`** is **disabled** unless **`ADMIN_RESET_KEY`** is set to a non-empty string.
- When disabled, the route returns **404** (does not advertise that the feature exists).
- When enabled, send header `x-admin-key: <same value as env>`.
- **Do not set** `ADMIN_RESET_KEY` in public Docker images or production unless you need the feature; prefer backups and migrations for real data.

## SQL injection

- All database access uses **better-sqlite3** with **bound parameters** (`?` placeholders). Dynamic query text is not built from user input for SQL.

## Developer Home (UI)

- The client **does not** embed an allowlisted username. After login, **`GET /profile`** includes **`developerHome: boolean`**, computed server-side from **`DEVELOPER_USERNAME`** (case-insensitive match to the authenticated user’s username).
- Set **`DEVELOPER_USERNAME`** in the server environment (e.g. `.env` or Docker Compose). Omit it to disable Developer Home for everyone.
- This is a **convenience gate**, not a security boundary for sensitive operations; do not rely on it alone for privileged API access.

## Room privacy

- **`room:get`** over the socket does not require a token. Anyone who knows or guesses a room code can read lobby snapshots. Room codes are short; treat this as **invite-link security**, not confidential matchmaking.

## TLS

- The app serves **HTTP** by default. For WAN access, terminate **TLS** at a reverse proxy (Traefik, Caddy, nginx) or cloud load balancer and forward to the container.

## Dependency vulnerabilities

- Run **`npm audit`** at the repo root before releases; upgrade patches when practical.
- **Vite dev server (esbuild advisory GHSA-67mh-4wv8-2f99):** affects untrusted networks reaching **`vite`**’s dev server. Mitigations: do not expose **`npm run dev`** to the public internet; use **`npm run build`** + production server or Docker for anything WAN-facing. Upgrading to a patched Vite major may require a coordinated bump of `@vitejs/plugin-react`; re-run audit after upgrades.

## Debugging and logging

- Production **browser** builds drop **`console`** / **`debugger`** (Vite `esbuild.drop`).
- Server logs a single **startup line** (listen address); avoid logging JWTs, passwords, or full match payloads.
