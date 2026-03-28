import { describe, expect, it } from "vitest";
import { cardArtUrl, cumulativePlaceBySeat, objectiveLabel, objectiveOrder, phaseLabel } from "./uiUtils.js";

describe("uiUtils", () => {
  it("phaseLabel maps known phases and fallback", () => {
    expect(phaseLabel("draw_choice")).toBe("Choose draw");
    expect(phaseLabel("custom_phase")).toBe("custom phase");
  });

  it("cumulativePlaceBySeat ranks ties", () => {
    const m = cumulativePlaceBySeat([
      { seat: 0, cumulativeScore: 10 },
      { seat: 1, cumulativeScore: 5 },
      { seat: 2, cumulativeScore: 5 }
    ]);
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(1);
    /* Competition ranking: two tied for first, next score is third place. */
    expect(m.get(0)).toBe(3);
  });

  it("cardArtUrl builds deckofcards URL", () => {
    expect(
      cardArtUrl({ id: "1", rank: "7", suit: "hearts", isWild: false })
    ).toContain("7H");
    expect(cardArtUrl({ id: "2", rank: "10", suit: "clubs", isWild: false })).toContain("0C");
    expect(cardArtUrl({ id: "3", rank: "JOKER", suit: "joker", isWild: true })).toContain("X1");
  });

  it("objective maps cover all hands", () => {
    expect(objectiveOrder.length).toBe(6);
    for (const k of objectiveOrder) {
      expect(objectiveLabel[k]).toBeTruthy();
    }
  });
});
