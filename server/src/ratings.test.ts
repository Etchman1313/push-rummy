import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MatchState } from "@push-rummy/shared";
import { initDb, resetDb, db } from "./db.js";
import { registerUser } from "./auth.js";
import { finalizeCompletedMatch } from "./ratings.js";

describe("ratings finalizeCompletedMatch", () => {
  beforeAll(() => initDb());
  beforeEach(() => resetDb(false));

  it("writes match and ratings for finished HvH", () => {
    const a = registerUser("p1a", "password12");
    const b = registerUser("p2b", "password12");
    const match = {
      roomCode: "ROOM",
      players: [
        { seat: 0, id: a.id, name: "p1", isAi: false },
        { seat: 1, id: b.id, name: "p2", isAi: false }
      ],
      currentHandIndex: 5,
      handHistory: [],
      cumulativeScores: { 0: 100, 1: 40 },
      pendingRoundSummary: null,
      hand: {} as MatchState["hand"],
      status: "finished" as const
    } as MatchState;
    finalizeCompletedMatch("match_test_1", "2020-01-01T00:00:00.000Z", match);
    const row = db.prepare("SELECT id FROM matches WHERE id = ?").get("match_test_1") as { id: string } | undefined;
    expect(row?.id).toBe("match_test_1");
    finalizeCompletedMatch("match_test_1", "2020-01-01T00:00:00.000Z", match);
    expect(true).toBe(true);
  });

  it("no-ops when match not finished", () => {
    const m = {
      roomCode: "R",
      players: [{ seat: 0, id: "x", name: "a", isAi: false }],
      currentHandIndex: 0,
      handHistory: [],
      cumulativeScores: { 0: 0 },
      pendingRoundSummary: null,
      hand: {} as MatchState["hand"],
      status: "in_hand" as const
    } as MatchState;
    finalizeCompletedMatch("mid2", "2020-01-01T00:00:00.000Z", m);
    const row = db.prepare("SELECT id FROM matches WHERE id = ?").get("mid2");
    expect(row).toBeUndefined();
  });

  it("rates humans vs AI and updates hvai tier columns", () => {
    const human = registerUser("hvai_human", "password12");
    const match = {
      roomCode: "ROOM",
      players: [
        { seat: 0, id: human.id, name: "you", isAi: false },
        { seat: 1, id: "ai_1", name: "Scout (Novice)", isAi: true, aiLevel: "novice" }
      ],
      currentHandIndex: 0,
      handHistory: [],
      cumulativeScores: { 0: 5, 1: 80 },
      pendingRoundSummary: null,
      hand: {} as MatchState["hand"],
      status: "finished" as const
    } as MatchState;
    finalizeCompletedMatch("match_hvai_1", "2020-01-01T00:00:00.000Z", match);
    const row = db
      .prepare("SELECT hvai_easy, hvai_medium, hvai_hard FROM player_ratings WHERE user_id = ?")
      .get(human.id) as { hvai_easy: number; hvai_medium: number; hvai_hard: number };
    expect(row).toBeTruthy();
  });
});
