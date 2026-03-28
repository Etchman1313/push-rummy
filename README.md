# Push Rummy

Realtime Push Rummy for 2-4 players with configurable AI opponents.

## Stack

- Frontend: React + Vite + Zustand + Socket.IO client
- Backend: Node + Express + Socket.IO (authoritative game server)
- Shared engine: TypeScript rules/scoring/game state machine used by server and client

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/README.md](docs/README.md) | Index of all documentation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, modules, APIs, state machine, deployment, scale-up |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | End-to-end product flow: accounts, lobby, table, AI, scoring, ratings |
| [docs/RULES.md](docs/RULES.md) | Canonical card rules and objectives (mirrors `@push-rummy/shared`) |
| [docs/SECURITY.md](docs/SECURITY.md) | Secrets, CORS, TLS, admin, rate limits |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Leaderboard cost, AI bounds, scaling caveats |
| [docs/RELEASE.md](docs/RELEASE.md) | **Commit + push:** GitHub **and** local Docker rebuild/restart |

## Release workflow (commit and push)

In this project, finishing a change usually means:

1. Push to **GitHub** (`git push`).
2. Rebuild and restart **local Docker** so the running app matches `main`: `npm run docker:up` (`docker compose up -d --build`).

Details and a checklist are in **[docs/RELEASE.md](docs/RELEASE.md)**.

## Quick start (development)

```bash
npm install
npm run typecheck
npm run dev
```

- API + Socket.IO: `http://localhost:8787`
- Vite UI: `http://localhost:5173`

### Remote / LAN access (dev)

- Vite uses `host: true` so the UI listens on all interfaces.
- From another device, open `http://<LAN-IP>:5173`. The client calls `http://<same-host>:8787` unless you set `VITE_SERVER_URL` in `client/.env.local`.
- **UFW:** allow `8787/tcp` and `5173/tcp` for dev if the firewall is on.
- If login fails from another machine, confirm `VITE_SERVER_URL` matches how you reach the API.

## Docker (production-style, always-on)

Host **9887** → container **8787** avoids colliding with MediaStack/Readarr conventions on **8787**.

1. Copy [.env.example](.env.example) to `.env` and set **`JWT_SECRET`** (at least 32 random characters; required in production).
2. Start:

```bash
cd /path/to/GameDev2
docker compose up -d --build
```

- **URL:** `http://<server-ip>:9887` (UI + API + Socket.IO; SQLite in volume `push-rummy-data`).
- **UFW:** `sudo ufw allow 9887/tcp`
- **Logs:** `docker compose logs -f`

Optional compose overrides (uncomment in `docker-compose.yml` or set in `.env`):

- **`CORS_ORIGIN`** — comma-separated browser origins (recommended if exposed to the internet).
- **`ADMIN_RESET_KEY`** — enables `POST /admin/reset-db` (omit in production unless required).
- **`TRUST_PROXY=1`** — if the app sits behind a reverse proxy (better rate-limit IP behavior).

## Environment variables (server)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes in `NODE_ENV=production` | Min 32 chars; signs auth tokens |
| `NODE_ENV` | Optional | `production` enables strict secret checks |
| `DB_PATH` | Optional | SQLite path (default `push-rummy.db` in cwd) |
| `BIND_ADDRESS` | Optional | Listen address (default `0.0.0.0`) |
| `PORT` | Optional | Listen port (default `8787`) |
| `CLIENT_DIST` | Optional | Directory with built SPA `index.html` |
| `CORS_ORIGIN` | Optional | Comma-separated allowed origins; unset = `*` |
| `ADMIN_RESET_KEY` | Optional | If unset, admin reset route is disabled (404) |
| `TRUST_PROXY` | Optional | Set to `1` behind nginx/Traefik |
| `RATING_K_FACTOR`, `RATING_AI_WEIGHT` | Optional | Tuning for Elo-style updates |
| `DEVELOPER_USERNAME` | Optional | Server-only; that login sees Developer Home (`GET /profile` returns `developerHome`) |

See [.env.example](.env.example) for a template.

## Game features

- 2–4 players, room codes, mixed human/AI tables, **five AI tiers** (novice → master) plus legacy easy/medium/hard mapping.
- **Random first actor** each hand; host stays seat 1 but is not always first to play.
- **Fair shuffle** (crypto RNG when available) for deal and deck reshuffles.
- 6-hand objectives, push rule, wilds, melds, legal discard enforcement.
- Cumulative scoring, tie-breaks, auth, leaderboard, ratings (global + segmented).

## Project layout

- `shared/src` — engine, rules, scoring, AI
- `server/src` — HTTP, Socket.IO, SQLite, ratings finalization
- `client/src` — UI and store
- `docs/` — architecture, gameplay, rules, security, performance ([index](docs/README.md))

## Competitive data

- Default DB path: `push-rummy.db` (or `/data/push-rummy.db` in Docker).
- Only matches with `status: finished` are persisted and rated.

## Admin reset (local / staging only)

The endpoint **`POST /admin/reset-db`** is **off by default**. Enable it by setting **`ADMIN_RESET_KEY`** to a strong secret, then:

```bash
curl -X POST http://localhost:8787/admin/reset-db \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_RESET_KEY" \
  -d '{"preserveUsers": true}'
```

Do not enable on public deployments unless you accept short-lived tokens and wiped stats risk; prefer backups.

## NPM scripts

- `npm run dev` — shared build + server + Vite
- `npm run build` — production artifacts
- `npm run typecheck` — TypeScript
- `npm run docker:up` / `npm run docker:down` — Compose helpers (after `git push`, run `docker:up` to refresh local containers)
