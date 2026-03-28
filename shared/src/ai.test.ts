import { describe, expect, it, vi } from "vitest";
import { chooseAiAction, runAiTurn } from "./ai.js";
import { createMatch } from "./game.js";
import * as rules from "./rules.js";
import { tc } from "./test-helpers.js";
import type { PlayerInfo } from "./types.js";

const players: PlayerInfo[] = [
  { seat: 0, id: "h0", name: "Human", isAi: false },
  { seat: 1, id: "ai1", name: "Bot", isAi: true, aiLevel: "easy" }
];

describe("chooseAiAction", () => {
  it("easy: random pickup vs push", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const a = chooseAiAction(m, 1, "easy");
    expect(a.type === "choose_pickup" || a.type === "choose_push").toBe(true);
    vi.restoreAllMocks();
  });

  it("medium: pickup when hand shares rank with top discard", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1].push({ id: "match", rank: top.rank, suit: "clubs", isWild: false });
    const a = chooseAiAction(m, 1, "medium");
    expect(a).toEqual({ type: "choose_pickup" });
  });

  it("defaults to choose_pickup for unknown phase guard", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "complete";
    expect(chooseAiAction(m, 1, "hard")).toEqual({ type: "choose_pickup" });
  });

  it("medium: pushes when hand has no card matching top discard rank", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    const top = m.hand.discard[m.hand.discard.length - 1]!;
    m.hand.hands[1] = [
      tc("c1", "3", "hearts"),
      tc("c2", "4", "hearts"),
      tc("c3", "5", "hearts"),
      tc("c4", "6", "hearts"),
      tc("c5", "7", "hearts"),
      tc("c6", "8", "hearts"),
      tc("c7", "9", "hearts")
    ].filter((c) => c.rank !== top.rank);
    while (m.hand.hands[1].length < 7) {
      m.hand.hands[1].push(tc(`pad${m.hand.hands[1].length}`, "3", "clubs"));
    }
    expect(m.hand.hands[1].every((c) => c.rank !== top.rank)).toBe(true);
    expect(chooseAiAction(m, 1, "medium")).toEqual({ type: "choose_push" });
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
    const a = chooseAiAction(m, 1, "hard");
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
    const a = chooseAiAction(m, 1, "hard");
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
    const a = chooseAiAction(m, 1, "hard");
    expect(a).toEqual({ type: "add_to_meld", meldId: "mx", cardId: "d" });
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
    expect(() => chooseAiAction(m, 1, "hard")).toThrow(/No legal discard/);
    spy.mockRestore();
  });
});

describe("runAiTurn", () => {
  it("stops when phase returns to draw_choice", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const after = runAiTurn(m, 1, "easy");
    expect(after.hand.turnPhase).toBe("draw_choice");
    vi.restoreAllMocks();
  });

  it("chains pickup then discard before turn passes", () => {
    const m = createMatch("R", players);
    m.hand.activeSeat = 1;
    m.hand.turnPhase = "draw_choice";
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const after = runAiTurn(m, 1, "easy");
    expect(after.hand.activeSeat).toBe(0);
    vi.restoreAllMocks();
  });
});
