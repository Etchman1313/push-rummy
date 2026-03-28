import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getLeaderboard, initDb, resetDb, LEADERBOARD_LIMIT_MAX } from "./db.js";
import { registerUser } from "./auth.js";

describe("db", () => {
  beforeAll(() => initDb());
  beforeEach(() => resetDb(false));

  it("getLeaderboard returns empty when no users", () => {
    expect(getLeaderboard("all", "rating", 10)).toEqual([]);
  });

  it("getLeaderboard includes registered user", () => {
    registerUser("dave", "password12");
    const rows = getLeaderboard("all", "rating", 50);
    expect(rows.some((r) => r.username === "dave")).toBe(true);
  });

  it("respects limit cap", () => {
    for (let i = 0; i < 5; i += 1) registerUser(`u${i}name`, "password12");
    expect(getLeaderboard("all", "rating", 3).length).toBeLessThanOrEqual(3);
  });

  it("supports leaderboard modes and sort keys", () => {
    registerUser("sorty", "password12");
    for (const mode of ["all", "hvh", "hvai", "easy", "medium", "hard"] as const) {
      const rows = getLeaderboard(mode, "rating", 10);
      expect(Array.isArray(rows)).toBe(true);
    }
    for (const sort of ["rating", "wins", "winRate", "avgPoints"] as const) {
      expect(Array.isArray(getLeaderboard("all", sort, 10))).toBe(true);
    }
  });
});
