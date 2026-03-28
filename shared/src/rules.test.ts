import { describe, expect, it } from "vitest";
import {
  canAddToMeld,
  canReplaceWildInMeld,
  findLaydownForObjective,
  isValidRun,
  isValidSet,
  legalDiscardCandidates,
  representedRankForWildInMeld,
  sortMeldCardsForDisplay,
  validateMeld
} from "./rules.js";
import { tc } from "./test-helpers.js";
import type { Meld } from "./types.js";

const h = "hearts";
const s = "spades";

describe("isValidSet", () => {
  it("rejects short melds", () => {
    expect(isValidSet([tc("1", "7", h), tc("2", "7", h)]).valid).toBe(false);
  });

  it("accepts three of a rank with wilds", () => {
    const w = tc("w", "2", h, true);
    const r = isValidSet([tc("1", "7", h), tc("2", "7", h), w]);
    expect(r.valid).toBe(true);
    expect(r.assignments[w.id]).toBe("7");
  });

  it("rejects mixed ranks among naturals", () => {
    expect(isValidSet([tc("1", "7", h), tc("2", "8", h), tc("3", "7", h)]).valid).toBe(false);
  });

  it("allows all-wild set", () => {
    const r = isValidSet([tc("a", "2", h, true), tc("b", "2", s, true), tc("c", "JOKER", "joker", true)]);
    expect(r.valid).toBe(true);
  });
});

describe("isValidRun (same suit, ace hi/lo)", () => {
  it("accepts low ace run A-2-3", () => {
    const r = isValidRun([tc("1", "A", h), tc("2", "2", h, true), tc("3", "3", h)]);
    expect(r.valid).toBe(true);
  });

  it("accepts high ace run Q-K-A", () => {
    const r = isValidRun([tc("1", "Q", h), tc("2", "K", h), tc("3", "A", h)]);
    expect(r.valid).toBe(true);
  });

  it("rejects mixed suits", () => {
    expect(isValidRun([tc("1", "7", h), tc("2", "8", h), tc("3", "9", s)]).valid).toBe(false);
  });

  it("rejects broken sequence without enough wilds", () => {
    expect(isValidRun([tc("1", "7", h), tc("2", "8", h), tc("3", "10", h)]).valid).toBe(false);
  });

  it("fills gaps with wilds", () => {
    const w = tc("w", "2", h, true);
    const r = isValidRun([tc("1", "5", h), tc("2", "7", h), w]);
    expect(r.valid).toBe(true);
    expect(r.assignments[w.id]).toBe("6");
  });
});

describe("validateMeld", () => {
  it("delegates to set or run", () => {
    expect(validateMeld("set", [tc("1", "9", h), tc("2", "9", h), tc("3", "9", h)]).valid).toBe(true);
    expect(validateMeld("run", [tc("1", "4", h), tc("2", "5", h), tc("3", "6", h)]).valid).toBe(true);
  });
});

describe("findLaydownForObjective", () => {
  it("finds two sets of 3 when possible", () => {
    const cards = [
      tc("a", "5", h),
      tc("b", "5", s),
      tc("c", "5", "diamonds"),
      tc("d", "K", h),
      tc("e", "K", s),
      tc("f", "K", "diamonds"),
      tc("g", "A", h)
    ];
    const lay = findLaydownForObjective("TWO_SETS_OF_3", cards);
    expect(lay).not.toBeNull();
    expect(lay!.length).toBe(2);
  });
});

describe("canAddToMeld", () => {
  const setMeld: Meld = {
    id: "m1",
    ownerSeat: 0,
    type: "set",
    cards: [tc("1", "8", h), tc("2", "8", s), tc("3", "8", "diamonds")],
    wildAssignments: {}
  };

  it("allows same rank or wild to set", () => {
    expect(canAddToMeld(tc("x", "8", "clubs"), setMeld)).toBe(true);
    expect(canAddToMeld(tc("w", "2", h, true), setMeld)).toBe(true);
    expect(canAddToMeld(tc("x", "9", h), setMeld)).toBe(false);
  });

  it("extends run when valid", () => {
    const run: Meld = {
      id: "r1",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "4", h), tc("2", "5", h), tc("3", "6", h)]
    };
    expect(canAddToMeld(tc("x", "7", h), run)).toBe(true);
    expect(canAddToMeld(tc("y", "7", s), run)).toBe(false);
  });
});

describe("legalDiscardCandidates", () => {
  it("excludes wilds and cards that extend table melds", () => {
    const hand = [tc("a", "9", h), tc("b", "JOKER", "joker", true)];
    const melds: Meld[] = [
      {
        id: "m",
        ownerSeat: 0,
        type: "run",
        cards: [tc("x", "3", h), tc("y", "4", h), tc("z", "5", h)]
      }
    ];
    const legal = legalDiscardCandidates(hand, melds);
    expect(legal.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("canReplaceWildInMeld", () => {
  it("replaces wild in set when natural matches rank", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "set",
      cards: [tc("1", "9", h), w],
      wildAssignments: { [w.id]: "9" }
    };
    expect(canReplaceWildInMeld(tc("n", "9", s), meld)).toBe(w.id);
  });

  it("requires suit match on run replacement", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "5", h), w, tc("2", "7", h)],
      wildAssignments: { [w.id]: "6" }
    };
    expect(canReplaceWildInMeld(tc("n", "6", s), meld)).toBeNull();
    expect(canReplaceWildInMeld(tc("n", "6", h), meld)).toBe(w.id);
  });
});

describe("representedRankForWildInMeld", () => {
  it("reads assignment or derives", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "4", h), w, tc("2", "6", h)],
      wildAssignments: { [w.id]: "5" }
    };
    expect(representedRankForWildInMeld(w, meld)).toBe("5");
  });

  it("derives rank from validateMeld when wildAssignments omits the wild", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "4", h), w, tc("2", "6", h)]
    };
    expect(representedRankForWildInMeld(w, meld)).toBe("5");
  });
});

describe("sortMeldCardsForDisplay", () => {
  it("sorts set with naturals first", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "set",
      cards: [w, tc("1", "4", h), tc("2", "4", s)]
    };
    const sorted = sortMeldCardsForDisplay(meld);
    expect(sorted[0]!.isWild).toBe(false);
    expect(sorted[sorted.length - 1]!.isWild).toBe(true);
  });

  it("sorts run by sequence rank", () => {
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "9", h), tc("2", "7", h), tc("3", "8", h)]
    };
    const sorted = sortMeldCardsForDisplay(meld).map((c) => c.rank);
    expect(sorted).toEqual(["7", "8", "9"]);
  });

  it("sorts run with wild using merged assignments", () => {
    const w = tc("w", "2", h, true);
    const meld: Meld = {
      id: "m",
      ownerSeat: 0,
      type: "run",
      cards: [tc("1", "5", h), w, tc("2", "7", h)],
      wildAssignments: { [w.id]: "6" }
    };
    const sorted = sortMeldCardsForDisplay(meld);
    expect(sorted.map((c) => c.rank)).toEqual(["5", "2", "7"]);
    expect(sorted[1]!.isWild).toBe(true);
  });
});
