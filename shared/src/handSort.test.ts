import { describe, expect, it } from "vitest";
import { sortHandForObjective } from "./handSort.js";
import { tc } from "./test-helpers.js";

describe("sortHandForObjective", () => {
  it("two sets of 3: two contiguous rank blocks when laydown exists", () => {
    const h = [
      tc("a", "7", "hearts"),
      tc("b", "7", "spades"),
      tc("c", "7", "diamonds"),
      tc("d", "K", "hearts"),
      tc("e", "K", "spades"),
      tc("f", "K", "diamonds")
    ];
    const s = sortHandForObjective("TWO_SETS_OF_3", h);
    expect(s).toHaveLength(6);
    expect(s.slice(0, 3).every((c) => c.rank === s[0]!.rank)).toBe(true);
    expect(s.slice(3, 6).every((c) => c.rank === s[3]!.rank)).toBe(true);
    expect(s[0]!.rank).not.toBe(s[3]!.rank);
  });

  it("run of 7: sorts by suit then rank when no full laydown", () => {
    const h = [
      tc("a", "5", "hearts"),
      tc("b", "9", "clubs"),
      tc("c", "6", "hearts"),
      tc("d", "4", "clubs"),
      tc("e", "3", "clubs"),
      tc("f", "8", "hearts"),
      tc("g", "7", "hearts")
    ];
    const s = sortHandForObjective("RUN_OF_7", h);
    const clubs = s.filter((c) => c.suit === "clubs");
    expect(clubs.map((c) => c.rank)).toEqual(["3", "4", "9"]);
    const hearts = s.filter((c) => c.suit === "hearts");
    expect(hearts.map((c) => c.rank)).toEqual(["5", "6", "7", "8"]);
  });

  it("RUN4_SET4: orders run block then set block when both exist", () => {
    const h = [
      tc("r1", "5", "hearts"),
      tc("r2", "6", "hearts"),
      tc("r3", "7", "hearts"),
      tc("r4", "8", "hearts"),
      tc("s1", "2", "clubs"),
      tc("s2", "2", "diamonds"),
      tc("s3", "2", "spades"),
      tc("s4", "2", "hearts")
    ];
    const s = sortHandForObjective("RUN4_SET4", h);
    const idx = (id: string) => s.findIndex((c) => c.id === id);
    expect(idx("r1")).toBeLessThan(idx("s1"));
  });
});
