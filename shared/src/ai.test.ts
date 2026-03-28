import { describe, expect, it, vi } from "vitest";
import { chooseAiAction, runAiTurn } from "./ai.js";
import { createMatch } from "./game.js";
import * as rules from "./rules.js";
import { tc } from "./test-helpers.js";
import type { PlayerInfo } from "./types.js";

const players: PlayerInfo[] = [
  { seat: 0, id: "h0", name: "Human", isAi: false },
  { seat: 1, id: "ai1", name: "Bot", isAi: true, aiLevel: "novice" }
];

describe("chooseAiAction", () => {
  it("novice: draw is pickup or push", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const a = chooseAiAction(m, 1, "novice");
    expect(a.type === "choose_pickup" || a.type === "choose_push").toBe(true);
  });

  it("skilled: pickup when hand shares rank with top discard", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1].push({ id: "match", rank: top.rank, suit: "clubs", isWild: false });
    const a = chooseAiAction(m, 1, "skilled");
    expect(a).toEqual({ type: "choose_pickup" });
  });

  it("legacy medium maps to skilled", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1].push({ id: "match", rank: top.rank, suit: "clubs", isWild: false });
    expect(chooseAiAction(m, 1, "medium")).toEqual({ type: "choose_pickup" });
  });

  it("defaults to choose_pickup for unknown phase guard", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "complete";
    expect(chooseAiAction(m, 1, "expert")).toEqual({ type: "choose_pickup" });
  });

  it("skilled: pushes when hand has no card matching top discard rank", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = tc("top", "9", "hearts", false);
    m.hand.discard = [tc("d0", "9", "spades", false), top];
    m.hand.hands[1] = [
      tc("c1", "3", "hearts"),
      tc("c2", "4", "hearts"),
      tc("c3", "5", "hearts"),
      tc("c4", "6", "hearts"),
      tc("c5", "7", "hearts"),
      tc("c6", "8", "hearts"),
      tc("c7", "10", "hearts")
    ];
    expect(m.hand.hands[1].every((c) => c.rank !== top.rank)).toBe(true);
    expect(chooseAiAction(m, 1, "skilled")).toEqual({ type: "choose_push" });
  });

  it("skilled: picks up when top card completes laydown even without same rank", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    m.hand.discard = [tc("top", "Q", "diamonds", false)];
    m.hand.hands[1] = [
      tc("a", "Q", "hearts"),
      tc("b", "Q", "spades"),
      tc("c", "4", "clubs"),
      tc("d", "4", "hearts"),
      tc("e", "4", "diamonds"),
      tc("f", "5", "clubs"),
      tc("g", "6", "clubs")
    ];
    const spy = vi.spyOn(rules, "findLaydownForObjective").mockReturnValue([
      [tc("a", "Q", "hearts"), tc("b", "Q", "spades"), tc("top", "Q", "diamonds")]
    ]);
    const a = chooseAiAction(m, 1, "skilled");
    spy.mockRestore();
    expect(a).toEqual({ type: "choose_pickup" });
  });

  it("returns laydown when findLaydownForObjective finds groups", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "action";
    m.hand.hands[1] = [
      tc("a", "7", "hearts"),
      tc("b", "7", "spades"),
      tc("c", "7", "diamonds"),
      tc("d", "K", "hearts"),
      tc("e", "K", "spades"),
      tc("f", "K", "diamonds")
    ];
    const spy = vi.spyOn(rules, "findLaydownForObjective").mockReturnValue([
      [tc("a", "7", "hearts"), tc("b", "7", "spades"), tc("c", "7", "diamonds")],
      [tc("d", "K", "hearts"), tc("e", "K", "spades"), tc("f", "K", "diamonds")]
    ]);
    const a = chooseAiAction(m, 1, "expert");
    spy.mockRestore();
    expect(a.type).toBe("laydown");
    if (a.type === "laydown") {
      expect(a.melds).toHaveLength(2);
    }
  });

  it("maps a single candidate group to a run when ranks differ", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "action";
    m.hand.hands[1] = [tc("a", "5", "hearts"), tc("b", "6", "hearts"), tc("c", "7", "hearts")];
    const spy = vi.spyOn(rules, "findLaydownForObjective").mockReturnValue([
      [tc("a", "5", "hearts"), tc("b", "6", "hearts"), tc("c", "7", "hearts")]
    ]);
    const a = chooseAiAction(m, 1, "master");
    spy.mockRestore();
    expect(a.type).toBe("laydown");
    if (a.type === "laydown") expect(a.melds[0]!.type).toBe("run");
  });

  it("returns add_to_meld when already down and a card extends a meld", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "action";
    m.hand.laidDown[1] = true;
    m.hand.tableMelds = [
      {
        id: "mx",
        ownerSeat: 1,
        type: "set",
        cards: [tc("a", "4", "hearts"), tc("b", "4", "spades"), tc("c", "4", "diamonds")]
      }
    ];
    m.hand.hands[1] = [tc("d", "4", "clubs"), tc("x", "5", "hearts")];
    const a = chooseAiAction(m, 1, "expert");
    expect(a).toEqual({ type: "add_to_meld", meldId: "mx", cardId: "d" });
  });

  it("SET_OF_8: prefers add_to_meld on larger set when both legal", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "action";
    m.hand.objective = "SET_OF_8";
    m.hand.laidDown[1] = true;
    const big = [
      tc("b1", "7", "hearts"),
      tc("b2", "7", "spades"),
      tc("b3", "7", "diamonds"),
      tc("b4", "7", "clubs"),
      tc("b5", "7", "hearts"),
      tc("b6", "7", "spades"),
      tc("b7", "7", "diamonds")
    ];
    const small = [tc("s1", "3", "hearts"), tc("s2", "3", "spades"), tc("s3", "3", "diamonds")];
    m.hand.tableMelds = [
      { id: "small", ownerSeat: 1, type: "set", cards: small },
      { id: "big", ownerSeat: 1, type: "set", cards: big }
    ];
    m.hand.hands[1] = [tc("add7", "7", "clubs"), tc("add3", "3", "clubs")];
    const a = chooseAiAction(m, 1, "expert");
    expect(a).toEqual({ type: "add_to_meld", meldId: "big", cardId: "add7" });
  });

  it("throws when no card can be added to melds and hand has no discardable naturals", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "action";
    m.hand.laidDown[1] = true;
    m.hand.tableMelds = [
      {
        id: "mx",
        ownerSeat: 1,
        type: "set",
        cards: [tc("a", "4", "hearts"), tc("b", "4", "spades"), tc("c", "4", "diamonds")]
      }
    ];
    m.hand.hands[1] = [tc("wonly", "2", "hearts", true)];
    const spy = vi.spyOn(rules, "canAddToMeld").mockReturnValue(false);
    expect(() => chooseAiAction(m, 1, "expert")).toThrow(/No legal discard/);
    spy.mockRestore();
  });
});

describe("runAiTurn", () => {
  it("ends on next player draw_choice after a full turn", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1].push({ id: "match", rank: top.rank, suit: "clubs", isWild: false });
    const after = runAiTurn(m, 1, "skilled");
    expect(after.hand.turnPhase).toBe("draw_choice");
  });

  it("chains pickup then discard before turn passes", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1].push({ id: "match", rank: top.rank, suit: "clubs", isWild: false });
    const after = runAiTurn(m, 1, "skilled");
    expect(after.hand.activeSeat).toBe(0);
  });
});
