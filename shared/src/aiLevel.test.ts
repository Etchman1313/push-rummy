import { describe, expect, it } from "vitest";
import { aiOpponentAnchor, normalizeAiLevel, ratingTier, tierPresence } from "./aiLevel.js";

describe("normalizeAiLevel", () => {
  it("maps legacy labels", () => {
    expect(normalizeAiLevel("easy")).toBe("novice");
    expect(normalizeAiLevel("medium")).toBe("skilled");
    expect(normalizeAiLevel("hard")).toBe("expert");
  });

  it("passes through canonical tiers", () => {
    expect(normalizeAiLevel("master")).toBe("master");
    expect(normalizeAiLevel("casual")).toBe("casual");
  });

  it("defaults unknown to skilled", () => {
    expect(normalizeAiLevel("weird")).toBe("skilled");
    expect(normalizeAiLevel()).toBe("skilled");
  });
});

describe("ratingTier", () => {
  it("groups tiers for DB columns", () => {
    expect(ratingTier("novice")).toBe("easy");
    expect(ratingTier("casual")).toBe("easy");
    expect(ratingTier("skilled")).toBe("medium");
    expect(ratingTier("expert")).toBe("hard");
    expect(ratingTier("master")).toBe("hard");
  });
});

describe("tierPresence", () => {
  it("aggregates normalized AI levels", () => {
    expect(tierPresence(["easy", "master"])).toEqual({ easy: true, medium: false, hard: true });
    expect(tierPresence(["skilled"])).toEqual({ easy: false, medium: true, hard: false });
  });
});

describe("aiOpponentAnchor", () => {
  it("uses normalized level", () => {
    expect(aiOpponentAnchor("easy")).toBe(aiOpponentAnchor("novice"));
    expect(aiOpponentAnchor("master")).toBeGreaterThan(aiOpponentAnchor("expert"));
  });
});
