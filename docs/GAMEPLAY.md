# Push Rummy — gameplay & product flow

This document describes the **player experience** and how it maps to the running system. For raw card rules (melds, objectives, points), see **[RULES.md](RULES.md)**.

## Accounts and session

- Players **register** or **log in** over REST (`POST /auth/register`, `POST /auth/login`). The server returns a **JWT** used for authenticated HTTP calls and Socket.IO actions.
- The **profile** endpoint (`GET /profile`) exposes stored ratings, aggregate records, and recent rating events for the logged-in user.
- Sessions are long-lived (JWT expiry is configured on the server). Logging out clears client-side tokens and disconnects the realtime socket.

## Leaderboard (lobby)

- Before or during play, users can open the **leaderboard** panel. Data comes from `GET /leaderboard` with filters for **matchup mode** (all, human vs human, human vs AI, or per **rating tier**: easy / medium / hard — grouping in-game AI tiers as above) and **sort** (rating, wins, win rate, average points).
- Leaderboards reflect **persisted** competitive data, not in-memory lobbies.

## Rooms and lobby

- A **host** creates a room and receives a **short room code** (invite-link style security — see `docs/SECURITY.md`).
- Other players **join** with that code while the match has not started.
- The host configures **seats**: each seat can be **open** (for a joining human) or filled with an **AI** at a chosen tier (**Novice** through **Master**). Legacy labels **easy / medium / hard** are still accepted on the wire and map to **novice / skilled / expert**. Bot display names in the lobby use tier labels (e.g. Scout (Novice), Grandmaster (Master)).
- **2–4 seated players** are required to start. Empty seats do not count.
- The host always occupies **seat 1** in the UI, but **who acts first on each new hand** is chosen **at random** among seated players (host is not guaranteed to be first).

## Starting a match

- When the host starts the game, the server builds a **match** from seat order: each seat becomes a `PlayerInfo` with optional `aiLevel` for bots (normalized to canonical tiers).
- The shared engine **shuffles** the stock with a **cryptographic RNG** when available (`crypto.getRandomValues`), with a safe fallback where not. Each new hand picks a **random starting seat** for the draw phase.
- The shared engine deals the first hand and sets the first **hand objective** (hand 1 of 6). See **RULES.md** for the objective list.

## Hand display

- Your hand is **sorted automatically** for the current round **objective**: when you can complete the objective, order follows valid meld groups; otherwise sets cluster by rank (set hands) or by suit then rank (run hands), with a run-then-set heuristic for mixed objectives (e.g. run + set). You can still **drag** cards to reorder until the next time your hand updates from the server.

## Turn flow (what the player sees)

1. **Draw choice** (`draw_choice`): the active player must **pick up** the visible discard or **push** (per rules: deck + discard bundle to the left neighbor, then draw). The UI sends `choose_pickup` or `choose_push`.
2. **Play** (`action`): pick up or push is resolved; the player may **lay down** melds that satisfy the current objective (first time laying down), **add to melds**, **replace a wild** with a natural, or move toward discard.
3. **Discard** (`discard_required`): if the hand is not empty, the player must **discard** a **legal** natural card. Wilds cannot be discarded while they could still be added to table melds; if no legal discard exists, the engine **forces draws** from the stock until one exists (see RULES.md).
4. The turn passes to the next seat; phases return to **draw_choice** for that seat.

If someone **goes out** (empties their hand legally), the hand ends immediately — no final discard is required when going out.

## AI opponents

- After each state change, the server runs **automated turns** for AI seats in a **bounded loop** so one human action cannot stall the process.
- **Tiers** (canonical): **novice**, **casual**, **skilled**, **expert**, **master** — from beginner-style noise through stronger heuristics. See `shared/src/ai.ts` and `shared/src/aiLevel.ts` for normalization and rating buckets.
- **Rough behavior**: novice uses more random draw/discard; casual mixes randomness with structured play; skilled uses same-rank / objective-aware pickup, **imperfect discard-pile “memory”** (last N discards), and occasional ace/face discard bias; expert/master add full-pile draw bias, ranked wild replacement by hand “danger,” optimized discards with small jitter, and prefers **larger / objective-critical melds** when several `add_to_meld` moves are legal (e.g. SET_OF_8).
- **Leaderboard** still exposes three **rating columns** (easy / medium / hard tiers): novice+casual roll into **easy**, skilled into **medium**, expert+master into **hard**.

Exact AI behavior is heuristic (no deep search) and subject to tuning.

## Scorecard and cumulative score

- The in-game **scorecard** shows each of the **six hands**, per-player points for that hand, and running cumulative totals.
- **Lower cumulative score is better** (points count deadwood in losers’ hands; the winner of a hand scores 0 for that hand).

## Between hands and match end

- When a hand completes, the match may enter **between hands** while players review the round. The **host** advances to the **next hand** with a **continue** action (next objective, new deal).
- After **hand 6**, if the match is finished, the server marks the match **finished**. **Cumulative totals** determine placement; **ties** use per-hand history (latest hands first) as in **RULES.md**.

## Ratings and records

- Only **finished** matches are written to SQLite and factored into **Elo-style** updates (separate global, human-vs-human, and human-vs-AI tracks; AI seats are anchored, not stored as users).
- Human players see **rating deltas** and **win/loss** breakdowns by mode in profile and on the leaderboard over time.

## Docker / production usage

- In production-style deployments, the **same origin** typically serves the SPA and API; the client discovers the API via `VITE_SERVER_URL` in dev or same-origin in prod. See root **README.md** for ports and Compose.

## Related documents

- **[RULES.md](RULES.md)** — meld validity, objectives, scoring values, tie-breaking.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — sockets, HTTP, and engine boundaries.
- **[RELEASE.md](RELEASE.md)** — commit, push to GitHub, and refresh local Docker (project convention).
