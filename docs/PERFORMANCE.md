# Push Rummy — performance notes

## Server

- **Lobby and active matches** live in an in-memory `Map`. Throughput is bounded by single-process CPU and Node’s event loop, which is sufficient for a small private server.
- **AI turns:** `autoRunAi` caps chained outer steps per event (**8**); each step runs `runAiTurn`, which itself bounds inner actions so a pathological state cannot spin forever in one tick. AI logic is heuristic (`shared/src/ai.ts`).
- **SQLite:** WAL mode is enabled. Writes happen on **match finalization** (ratings/records), not on every card action.

## Leaderboard (`GET /leaderboard`)

- Implementation loads **all users** with ratings and records in one query, computes derived fields in memory, sorts, then applies `limit` (capped at **`LEADERBOARD_LIMIT_MAX`** in `server/src/db.ts`, currently **500**).
- This is **O(n)** in memory per request. It is acceptable for hundreds to a few thousand accounts; for large-scale deployments, add **SQL-level filtering/ordering** or **materialized views / caching**.

## Client production build

- Vite **drops `console` and `debugger`** in production builds to reduce noise and bundle size.

## Horizontal scaling

- Multiple Node processes **cannot** share the same in-memory room map without a shared store or sticky sessions. See “Scale-Up Path” in `docs/ARCHITECTURE.md`.
