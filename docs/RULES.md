# Push Rummy — canonical rules (v1)

This document matches the implementation in **`@push-rummy/shared`**. If behavior diverges, treat the code as authoritative and update this file.

## Table setup

- **Players:** 2–4.
- **Deck:** two standard 52-card decks plus **four jokers** (`shared/src/cards.ts`: `createDoubleDeckWithJokers`).
- **Wild cards:** all **2s** and all **JOKER** cards (`isWild` on `Card`).
- **Deal:** 7 cards per player; one card starts the discard pile; remainder is the stock.

## Hand objectives (six hands, fixed order)

Each hand has exactly one objective. The engine uses the following structure (`OBJECTIVE_REQUIREMENTS` in `rules.ts`):

| Hand | Objective id | Required melds |
|------|----------------|------------------|
| 1 | `TWO_SETS_OF_3` | Two **sets** of **3** cards each |
| 2 | `RUN4_SET4` | One **run** of **4** + one **set** of **4** |
| 3 | `TWO_RUNS_OF_4` | Two **runs** of **4** each |
| 4 | `THREE_SETS_OF_3` | Three **sets** of **3** each |
| 5 | `RUN_OF_7` | One **run** of **7** |
| 6 | `SET_OF_8` | One **set** of **8** |

A **set** is same rank (any suits); wilds may substitute. A **run** is consecutive ranks in **one suit**; wilds may fill gaps. **Ace** may be low (e.g. A-2-3) or high (e.g. Q-K-A). **K-A-2** “around the corner” is **not** a valid run.

## Turn flow

### 1. Draw choice

- **Pick up:** take the top discard into your hand; turn moves to main play.
- **Push:** draw one card from stock face-down, take the current top discard, and pass **both** to the player on your **left** (they add both to hand). You then draw one card from stock for yourself. (Implementation: `choose_push` in `game.ts`.)

### 2. Main play (after draw)

- **First laydown:** you must lay melds that **satisfy the current hand objective** using cards from your hand. The engine checks the objective via `findLaydownForObjective`.
- **After you are “laid down”** for this hand, you may:
  - **Add** a card from hand to an existing table meld (`add_to_meld`) if `canAddToMeld` allows it.
  - **Replace** a wild in a meld with a natural from hand (`replace_wild`) when `canReplaceWildInMeld` allows it (set: natural matches rank; run: suit and represented rank must align).

### 3. End of turn — discard

- If you still have cards and did not go out, you must **discard** a **legal** card.
- **Wilds (2s and Jokers) cannot be discarded** if they could legally be added to a table meld (`legalDiscardCandidates`).
- If **no** legal discard exists (e.g. hand is only wilds that cannot be discarded yet), you **draw from stock** repeatedly until a legal discard exists (**forced draw**). The UI may surface a forced-draw event from the server state.

### Deck exhaustion

- If the stock is empty and you must draw, the discard pile (except the top visible card) is shuffled to form a new stock (`drawCard` in `game.ts`). If only one card remains in discard and stock is empty, the game cannot draw — rare edge case.

## Going out

- You may **go out** when your last card leaves your hand legally:
  - Via **laydown** / **add_to_meld** that empties your hand (no discard step).
  - Via **discard** of your **last natural** (wilds cannot be discarded as the last card if they must be melded instead).
- **Winner of the hand** scores **0** points for that hand; opponents score the **deadwood** value of cards left in their hands (see scoring).

## Scoring (deadwood values)

Implemented in `scoreValue` (`cards.ts`):

| Card | Points |
|------|--------|
| Joker | 50 |
| 2 (wild) | 25 |
| A | 20 |
| 10, J, Q, K | 10 |
| 3–9 | 5 |

## Match scoring and placement

- **Cumulative score** across all six hands: **lower is better**.
- **Winner** after hand 6: seat(s) with **lowest** cumulative total.
- **Tie-break** (`getWinners` / `breakTieByLatestHands`): among tied seats, compare **per-hand** results starting from the **last** hand and walking backward; lowest score in that hand wins the tie; missing data for a seat is treated as worst possible for that comparison.

**Competition ranking** (e.g. leaderboard-style “place” in a round): if two players tie for lowest cumulative, they **share** the same rank; the next worse score skips a place (e.g. 1, 1, 3). The client helper `cumulativePlaceBySeat` follows this logic.

## AI (reference)

- AI chooses **pick up vs push** on `draw_choice` (easy: random; medium/hard: heuristic using discard rank).
- Then tries **laydown** if the objective can be satisfied, else **add to meld**, else **discard** (`shared/src/ai.ts`).

## Related docs

- **`docs/GAMEPLAY.md`** — accounts, lobby, UI flow, ratings overview.
- **`docs/ARCHITECTURE.md`** — server and engine boundaries.
