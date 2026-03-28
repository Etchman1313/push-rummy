import { applyAction, GameAction } from "./game.js";
import { canAddToMeld, findLaydownForObjective, legalDiscardCandidates } from "./rules.js";
import { MatchState } from "./types.js";

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chooseDiscard(match: MatchState, seat: number): GameAction {
  const hand = match.hand.hands[seat];
  const legal = legalDiscardCandidates(hand, match.hand.tableMelds);
  if (legal.length === 0) {
    throw new Error("No legal discard (wilds cannot be discarded; hand may be all wilds before forced draw)");
  }
  return { type: "discard", cardId: legal[0].id };
}

function choosePostDrawAction(match: MatchState, seat: number): GameAction {
  const handState = match.hand;
  const hand = handState.hands[seat];
  if (!handState.laidDown[seat]) {
    const candidate = findLaydownForObjective(handState.objective, hand);
    if (candidate) {
      const melds = candidate.map((cards) => {
        const setRanks = new Set(cards.filter((c) => !c.isWild).map((c) => c.rank));
        const type: "set" | "run" = setRanks.size <= 1 ? "set" : "run";
        return { type, cardIds: cards.map((c) => c.id) };
      });
      return { type: "laydown", melds };
    }
  }
  if (handState.laidDown[seat]) {
    for (const c of hand) {
      const meld = handState.tableMelds.find((m) => canAddToMeld(c, m));
      if (meld) return { type: "add_to_meld", meldId: meld.id, cardId: c.id };
    }
  }
  return chooseDiscard(match, seat);
}

export function chooseAiAction(match: MatchState, seat: number, level: "easy" | "medium" | "hard"): GameAction {
  const phase = match.hand.turnPhase;
  if (phase === "draw_choice") {
    if (level === "easy") return randomOf([{ type: "choose_pickup" }, { type: "choose_push" }] as GameAction[]);
    const top = match.hand.discard[match.hand.discard.length - 1];
    const hand = match.hand.hands[seat];
    const sameRank = hand.some((c) => c.rank === top.rank);
    return sameRank ? { type: "choose_pickup" } : { type: "choose_push" };
  }
  if (phase === "action" || phase === "discard_required") return choosePostDrawAction(match, seat);
  return { type: "choose_pickup" };
}

export function runAiTurn(initial: MatchState, seat: number, level: "easy" | "medium" | "hard"): MatchState {
  let state = initial;
  for (let i = 0; i < 5 && state.status === "in_hand" && state.hand.activeSeat === seat; i += 1) {
    const action = chooseAiAction(state, seat, level);
    state = applyAction(state, seat, action);
    if (state.hand.turnPhase === "draw_choice") break;
  }
  return state;
}
