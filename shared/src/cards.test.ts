import { describe, expect, it, vi } from "vitest";
import { cardFace, createDoubleDeckWithJokers, rankValue, scoreValue, shuffle } from "./cards.js";

describe("createDoubleDeckWithJokers", () => {
  it("produces 108 cards (52*2 + 4 jokers)", () => {
    const deck = createDoubleDeckWithJokers();
    expect(deck.length).toBe(108);
  });
});

describe("shuffle", () => {
  it("returns same length and preserves elements", () => {
    const arr = [1, 2, 3, 4, 5];
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const out = shuffle(arr);
    expect(out.length).toBe(5);
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
    vi.restoreAllMocks();
  });
});

describe("cardFace", () => {
  it("formats joker and suited cards", () => {
    expect(cardFace({ id: "1", rank: "JOKER", suit: "joker", isWild: true })).toBe("JOKER");
    expect(cardFace({ id: "2", rank: "7", suit: "hearts", isWild: false })).toBe("7H");
  });
});

describe("rankValue", () => {
  it("maps ranks for sequencing", () => {
    expect(rankValue("A")).toBe(1);
    expect(rankValue("2")).toBe(2);
    expect(rankValue("10")).toBe(10);
    expect(rankValue("J")).toBe(11);
    expect(rankValue("Q")).toBe(12);
    expect(rankValue("K")).toBe(13);
    expect(rankValue("JOKER")).toBe(0);
  });
});

describe("scoreValue", () => {
  it("matches push rummy penalty points", () => {
    expect(scoreValue("JOKER")).toBe(50);
    expect(scoreValue("2")).toBe(25);
    expect(scoreValue("A")).toBe(20);
    expect(scoreValue("K")).toBe(10);
    expect(scoreValue("7")).toBe(5);
  });
});
