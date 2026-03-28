import { describe, expect, it } from "vitest";
import { scoreHand, breakTieByLatestHands } from "./scoring.js";
import { tc } from "./test-helpers.js";

describe("scoreHand", () => {
  it("sums scoreValue for cards", () => {
    const cards = [tc("a", "7", "hearts"), tc("b", "K", "spades"), tc("c", "JOKER", "joker")];
    expect(scoreHand(cards)).toBe(5 + 10 + 50);
  });
});

describe("breakTieByLatestHands", () => {
  it("returns sole leader when unique min cumulative", () => {
    expect(breakTieByLatestHands([0, 1], [{ 0: 10, 1: 20 }])).toEqual([0]);
  });

  it("narrows ties using hand history from latest hand backward", () => {
    const history = [
      { 0: 5, 1: 5, 2: 20 },
      { 0: 10, 1: 12, 2: 8 }
    ];
    expect(breakTieByLatestHands([0, 1], history)).toEqual([0]);
  });

  it("returns multiple when still tied", () => {
    expect(breakTieByLatestHands([0, 1], [{ 0: 5, 1: 5 }])).toEqual([0, 1]);
  });

  it("treats missing seat in a hand row as infinitely high", () => {
    expect(breakTieByLatestHands([0, 1], [{ 0: 3 }])).toEqual([0]);
  });

  it("walks back multiple hands until tie breaks", () => {
    const history = [
      { 0: 10, 1: 10 },
      { 0: 7, 1: 8 },
      { 0: 5, 1: 5 }
    ];
    expect(breakTieByLatestHands([0, 1], history)).toEqual([0]);
  });
});
