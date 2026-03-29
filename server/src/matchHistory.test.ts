import { describe, expect, it } from "vitest";
import { computeMatchAnalytics, type UserMatchScorecard } from "./matchHistory.js";

function card(
  endedAt: string,
  placement: number,
  overrides: Partial<UserMatchScorecard> = {}
): UserMatchScorecard {
  return {
    matchId: `m_${endedAt}`,
    startedAt: endedAt,
    endedAt,
    tableMode: "hvh",
    totalPlayers: 2,
    myPlacement: placement,
    myScore: placement * 10,
    won: placement === 1,
    standings: [],
    ...overrides
  };
}

describe("computeMatchAnalytics", () => {
  const t0 = new Date("2026-03-01T12:00:00.000Z").getTime();

  it("computes streak from most recent matches", () => {
    const newestFirst = [card("2026-03-10T12:00:00.000Z", 1), card("2026-03-09T12:00:00.000Z", 1), card("2026-03-08T12:00:00.000Z", 2)];
    const a = computeMatchAnalytics(newestFirst, t0);
    expect(a.streak).toEqual({ kind: "win", length: 2 });
  });

  it("counts loss streak", () => {
    const newestFirst = [card("2026-03-10T12:00:00.000Z", 2), card("2026-03-09T12:00:00.000Z", 3)];
    const a = computeMatchAnalytics(newestFirst, t0);
    expect(a.streak).toEqual({ kind: "loss", length: 2 });
  });

  it("filters last 7d and 30d", () => {
    const newestFirst = [
      card("2026-03-27T12:00:00.000Z", 1),
      card("2026-03-20T12:00:00.000Z", 2),
      card("2026-02-01T12:00:00.000Z", 1)
    ];
    const now = new Date("2026-03-27T15:00:00.000Z").getTime();
    const a = computeMatchAnalytics(newestFirst, now);
    expect(a.last7d.games).toBe(1);
    expect(a.last30d.games).toBe(2);
  });

  it("recentForm is oldest-first among last slice", () => {
    const newestFirst = [card("2026-03-03T12:00:00.000Z", 1), card("2026-03-02T12:00:00.000Z", 2), card("2026-03-01T12:00:00.000Z", 1)];
    const a = computeMatchAnalytics(newestFirst, t0);
    expect(a.recentForm).toEqual(["W", "L", "W"]);
  });
});
