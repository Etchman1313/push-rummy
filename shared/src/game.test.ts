import { describe, expect, it } from "vitest";
import { applyAction, continueToNextHand, createMatch, getWinners, type GameAction } from "./game.js";
import { legalDiscardCandidates } from "./rules.js";
import { tc } from "./test-helpers.js";
import type { MatchState, PlayerInfo, Rank } from "./types.js";

const h = "hearts";

function twoHumans(): PlayerInfo[] {
  return [
    { seat: 0, id: "u_a", name: "a", isAi: false },
    { seat: 1, id: "u_b", name: "b", isAi: false }
  ];
}

/** Tests that call applyAction as seat 0 need a fixed first actor; real matches randomize first seat. */
function matchForTests(): MatchState {
  const m = createMatch("R", twoHumans());
  m.hand.activeSeat = 0;
  return m;
}

describe("createMatch", () => {
  it("starts hand one with draw_choice", () => {
    const m = createMatch("ROOM", twoHumans());
    expect(m.status).toBe("in_hand");
    expect(m.hand.turnPhase).toBe("draw_choice");
    expect(m.hand.hands[0]).toHaveLength(7);
    expect(twoHumans().map((p) => p.seat)).toContain(m.hand.activeSeat);
  });
});

describe("applyAction", () => {
  it("ignores actions when match not in hand", () => {
    const m = matchForTests();
    m.status = "lobby";
    const r = applyAction(m, 0, { type: "choose_pickup" });
    expect(r).toBe(m);
  });

  it("throws on wrong seat", () => {
    const m = matchForTests();
    expect(() => applyAction(m, 1, { type: "choose_pickup" })).toThrow("Not your turn");
  });

  it("choose_pickup takes discard", () => {
    const m = matchForTests();
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    const prevLen = m.hand.hands[0].length;
    const next = applyAction(m, 0, { type: "choose_pickup" });
    expect(next.hand.hands[0].length).toBe(prevLen + 1);
    expect(next.hand.hands[0].some((c) => c.id === top.id)).toBe(true);
    expect(next.hand.turnPhase).toBe("action");
  });

  it("choose_push moves cards to next player", () => {
    const m = matchForTests();
    const next = applyAction(m, 0, { type: "choose_push" });
    expect(next.hand.turnPhase).toBe("action");
    expect(next.hand.hands[1].length).toBeGreaterThan(7);
  });
});

describe("getWinners", () => {
  it("returns lowest cumulative seat(s)", () => {
    const m = matchForTests();
    m.cumulativeScores[0] = 10;
    m.cumulativeScores[1] = 5;
    expect(getWinners(m)).toEqual([1]);
  });

  it("breaks cumulative ties using hand history", () => {
    const m = matchForTests();
    m.cumulativeScores[0] = 20;
    m.cumulativeScores[1] = 20;
    m.handHistory = [
      { 0: 10, 1: 5 },
      { 0: 5, 1: 15 }
    ];
    expect(getWinners(m)).toEqual([0]);
  });
});

describe("continueToNextHand", () => {
  it("no-ops when not between hands", () => {
    const m = matchForTests();
    const n = continueToNextHand(m);
    expect(n.currentHandIndex).toBe(0);
  });

  it("advances hand when between_hands", () => {
    const m = matchForTests();
    m.status = "between_hands";
    const n = continueToNextHand(m);
    expect(n.currentHandIndex).toBe(1);
    expect(n.status).toBe("in_hand");
  });
});

describe("laydown and discard", () => {
  it("laydown two sets goes out", () => {
    const m = matchForTests();
    m.hand.hands[0] = [
      tc("a", "7", h),
      tc("b", "7", "spades"),
      tc("c", "7", "diamonds"),
      tc("d", "K", h),
      tc("e", "K", "spades"),
      tc("f", "K", "diamonds")
    ];
    m.hand.turnPhase = "action";
    const next = applyAction(m, 0, {
      type: "laydown",
      melds: [
        { type: "set", cardIds: ["a", "b", "c"] },
        { type: "set", cardIds: ["d", "e", "f"] }
      ]
    });
    expect(next.hand.winnerSeat).toBe(0);
    expect(next.hand.turnPhase).toBe("complete");
  });

  it("rejects duplicate card in laydown", () => {
    const m = matchForTests();
    const [a, b, c] = m.hand.hands[0];
    m.hand.turnPhase = "action";
    expect(() =>
      applyAction(m, 0, {
        type: "laydown",
        melds: [{ type: "set", cardIds: [a!.id, a!.id, c!.id] }]
      })
    ).toThrow(/Duplicate/);
  });

  it("discards after pickup when legal candidate exists", () => {
    const m = matchForTests();
    let s = applyAction(m, 0, { type: "choose_pickup" });
    const candidates = legalDiscardCandidates(s.hand.hands[0], s.hand.tableMelds);
    expect(candidates.length).toBeGreaterThan(0);
    s = applyAction(s, 0, { type: "discard", cardId: candidates[0]!.id });
    expect(s.hand.activeSeat).toBe(1);
    expect(s.hand.turnPhase).toBe("draw_choice");
  });

  it("choose_push reshuffles when deck empty", () => {
    const m = matchForTests();
    m.hand.deck = [];
    m.hand.discard = [tc("d1", "4", h), tc("d2", "5", h), tc("d3", "6", h)];
    const next = applyAction(m, 0, { type: "choose_push" });
    expect(next.hand.turnPhase).toBe("action");
  });

  it("unknown action type returns cloned state unchanged", () => {
    const m = matchForTests();
    m.hand.turnPhase = "action";
    const r = applyAction(m, 0, { type: "not_a_real_action" } as unknown as GameAction);
    expect(r).not.toBe(m);
    expect(r.roomCode).toBe(m.roomCode);
    expect(r.hand.turnPhase).toBe("action");
  });

  it("replace_wild swaps natural for wild in set", () => {
    const m = matchForTests();
    const wild = tc("w", "2", h, true);
    const meld = {
      id: "mx",
      ownerSeat: 0,
      type: "set" as const,
      cards: [tc("a", "9", h), tc("b", "9", "spades"), wild],
      wildAssignments: { [wild.id]: "9" } as Record<string, Rank>
    };
    const natural = tc("n", "9", "diamonds");
    m.hand.tableMelds = [meld];
    m.hand.hands[0] = [natural];
    m.hand.laidDown[0] = true;
    m.hand.turnPhase = "action";
    const next = applyAction(m, 0, { type: "replace_wild", meldId: "mx", cardId: "n" });
    expect(next.hand.hands[0].some((c) => c.id === "w")).toBe(true);
  });

  it("discard last natural goes out", () => {
    const m = matchForTests();
    const last = tc("last", "4", "clubs");
    m.hand.hands[0] = [last];
    m.hand.turnPhase = "discard_required";
    const next = applyAction(m, 0, { type: "discard", cardId: "last" });
    expect(next.hand.winnerSeat).toBe(0);
    expect(next.hand.turnPhase).toBe("complete");
  });

  it("add_to_meld last card goes out", () => {
    const m = matchForTests();
    const meld = {
      id: "mx",
      ownerSeat: 0,
      type: "set" as const,
      cards: [tc("a", "J", h), tc("b", "J", "spades"), tc("c", "J", "diamonds")]
    };
    m.hand.tableMelds = [meld];
    m.hand.hands[0] = [tc("d", "J", "clubs")];
    m.hand.laidDown[0] = true;
    m.hand.turnPhase = "action";
    const next = applyAction(m, 0, { type: "add_to_meld", meldId: "mx", cardId: "d" });
    expect(next.hand.winnerSeat).toBe(0);
    expect(next.hand.turnPhase).toBe("complete");
  });

  it("add_to_meld triggers forced draw when remaining hand is all wilds", () => {
    const m = matchForTests();
    const meld = {
      id: "mx",
      ownerSeat: 0,
      type: "set" as const,
      cards: [tc("a", "5", h), tc("b", "5", "spades"), tc("c", "5", "diamonds")]
    };
    m.hand.tableMelds = [meld];
    const w1 = tc("w1", "2", h, true);
    m.hand.hands[0] = [tc("d", "5", "clubs"), w1];
    m.hand.laidDown[0] = true;
    m.hand.turnPhase = "action";
    m.hand.deck = [tc("e", "6", h), tc("f", "7", h), tc("g", "8", h)];
    const next = applyAction(m, 0, { type: "add_to_meld", meldId: "mx", cardId: "d" });
    expect(next.hand.lastForcedDrawEvent).not.toBeNull();
    expect(next.hand.lastForcedDrawEvent!.count).toBeGreaterThan(0);
    expect(next.hand.turnPhase).toBe("discard_required");
  });

  it("add_to_meld extends run and refreshes wildAssignments", () => {
    const m = matchForTests();
    const meld = {
      id: "mr",
      ownerSeat: 0,
      type: "run" as const,
      cards: [tc("a", "5", h), tc("b", "6", h), tc("c", "7", h)]
    };
    m.hand.tableMelds = [meld];
    /* After adding 8, keep two off-run naturals so the first discard is not a go-out. */
    m.hand.hands[0] = [tc("d", "8", h), tc("x", "3", "spades"), tc("y", "4", "clubs")];
    m.hand.laidDown[0] = true;
    m.hand.turnPhase = "action";
    const next = applyAction(m, 0, { type: "add_to_meld", meldId: "mr", cardId: "d" });
    const updated = next.hand.tableMelds.find((t) => t.id === "mr")!;
    expect(updated.cards.some((c) => c.id === "d")).toBe(true);
    expect(next.hand.turnPhase).toBe("discard_required");
    const fin = applyAction(next, 0, { type: "discard", cardId: "x" });
    expect(fin.hand.activeSeat).toBe(1);
    expect(fin.hand.turnPhase).toBe("draw_choice");
  });

  it("sets match finished after winning the final objective hand", () => {
    const m = matchForTests();
    m.currentHandIndex = 5;
    m.hand.hands[0] = [tc("solo", "4", h)];
    m.hand.turnPhase = "discard_required";
    const next = applyAction(m, 0, { type: "discard", cardId: "solo" });
    expect(next.status).toBe("finished");
  });

  it("laydown leaves only wilds and forces draw before discard", () => {
    const m = matchForTests();
    m.hand.hands[0] = [
      tc("a", "7", h),
      tc("b", "7", "spades"),
      tc("c", "7", "diamonds"),
      tc("d", "K", h),
      tc("e", "K", "spades"),
      tc("f", "K", "diamonds"),
      tc("w1", "2", h, true),
      tc("w2", "JOKER", "joker", true)
    ];
    m.hand.turnPhase = "action";
    m.hand.deck = [tc("d1", "3", h), tc("d2", "4", h), tc("d3", "5", h)];
    const next = applyAction(m, 0, {
      type: "laydown",
      melds: [
        { type: "set", cardIds: ["a", "b", "c"] },
        { type: "set", cardIds: ["d", "e", "f"] }
      ]
    });
    expect(next.hand.lastForcedDrawEvent).not.toBeNull();
    expect(next.hand.turnPhase).toBe("discard_required");
  });

  it("add_to_meld wild on set updates wildAssignments", () => {
    const m = matchForTests();
    const meld = {
      id: "mx",
      ownerSeat: 0,
      type: "set" as const,
      cards: [tc("a", "Q", h), tc("b", "Q", "spades"), tc("c", "Q", "diamonds")]
    };
    m.hand.tableMelds = [meld];
    const w = tc("w", "2", h, true);
    m.hand.hands[0] = [w, tc("d", "4", h)];
    m.hand.laidDown[0] = true;
    m.hand.turnPhase = "action";
    const next = applyAction(m, 0, { type: "add_to_meld", meldId: "mx", cardId: "w" });
    expect(next.hand.tableMelds[0]!.wildAssignments?.[w.id]).toBe("Q");
  });
});
