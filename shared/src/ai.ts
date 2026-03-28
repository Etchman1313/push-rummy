import { normalizeAiLevel } from "./aiLevel.js";
import { pickUniformElement, randomIntBelow, scoreValue } from "./cards.js";
import { applyAction, GameAction } from "./game.js";
import { canAddToMeld, canReplaceWildInMeld, findLaydownForObjective, legalDiscardCandidates } from "./rules.js";
import type { AiLevel, Card, HandState, MatchState, Meld, Objective, Rank } from "./types.js";

// --- Tunables (playtest) ---
const PILE_WINDOW_SKILLED = 12;
const PILE_RANK_HIGH = 3;
const PILE_RANK_LOW = 1;
/** When rank appears often in pile: probability we push (deny) vs speculative pickup. */
const PILE_FAVOR_PUSH_WHEN_HIGH = 0.78;
const PILE_SPECULATIVE_PICKUP_WHEN_LOW = 0.38;
const PILE_FAVOR_PUSH_EXPERT_HIGH = 0.82;
const PILE_SPECULATIVE_PICKUP_EXPERT_LOW = 0.35;
const EXPERT_SECOND_BEST_DISCARD_PCT = 10;
const SKILLED_ACE_FACE_JITTER_PCT = 35;
const SKILLED_ACE_BONUS = 12;
const SKILLED_FACE_BONUS = 6;
const DANGER_HIGH = 115;
const DANGER_LOW = 48;
const WILD_DUMP_EXTRA_SCORE = 22;

function discardTop(h: HandState): Card | undefined {
  return h.discard[h.discard.length - 1];
}

/** Deterministic per seat/hand for tie-breaks and personality (stable within a hand). */
function handSeed(match: MatchState, seat: number): number {
  let h = 2166136261;
  const s = `${match.roomCode}:${seat}:${match.currentHandIndex}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRand(match: MatchState, seat: number, salt: number): number {
  return mulberry32(handSeed(match, seat) ^ salt)();
}

function rankCountForTop(
  discard: Card[],
  rank: Rank,
  lastN: number | null
): number {
  const slice = lastN != null && discard.length > lastN ? discard.slice(-lastN) : discard;
  let n = 0;
  for (const c of slice) {
    if (c.rank === rank) n += 1;
  }
  return n;
}

function pickupBuildsObjective(handState: HandState, seat: number, top: Card): boolean {
  const hand = handState.hands[seat];
  const hyp = [...hand, top];
  if (!handState.laidDown[seat]) {
    return findLaydownForObjective(handState.objective, hyp) != null;
  }
  for (const c of hyp) {
    if (handState.tableMelds.some((m) => canAddToMeld(c, m))) return true;
  }
  return false;
}

function meldAddScore(meld: Meld, objective: Objective): number {
  let s = meld.cards.length * 3;
  if (objective === "SET_OF_8" && meld.type === "set") {
    s += meld.cards.length * 4;
  }
  return s;
}

function chooseBestAddToMeld(match: MatchState, seat: number, hand: Card[], objective: Objective): GameAction | null {
  const candidates: Array<{ card: Card; meld: Meld; score: number }> = [];
  for (const c of hand) {
    for (const m of match.hand.tableMelds) {
      if (canAddToMeld(c, m)) {
        candidates.push({ card: c, meld: m, score: meldAddScore(m, objective) });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  return { type: "add_to_meld", meldId: best.meld.id, cardId: best.card.id };
}

function allReplaceWildActions(match: MatchState, seat: number): Array<{ type: "replace_wild"; meldId: string; cardId: string }> {
  const out: Array<{ type: "replace_wild"; meldId: string; cardId: string }> = [];
  const hand = match.hand.hands[seat];
  for (const c of hand) {
    for (const m of match.hand.tableMelds) {
      if (canReplaceWildInMeld(c, m)) {
        out.push({ type: "replace_wild", meldId: m.id, cardId: c.id });
      }
    }
  }
  return out;
}

function tryReplaceWildRanked(match: MatchState, seat: number, level: AiLevel, danger: number): GameAction | null {
  const actions = allReplaceWildActions(match, seat);
  if (actions.length === 0) return null;
  const hand = match.hand.hands[seat];
  const scoreAction = (a: (typeof actions)[0]): number => {
    const card = hand.find((c) => c.id === a.cardId);
    if (!card) return 0;
    let pts = scoreValue(card.rank);
    if (danger >= DANGER_HIGH) pts += WILD_DUMP_EXTRA_SCORE;
    if (danger <= DANGER_LOW && (level === "expert" || level === "master")) {
      pts -= seededRand(match, seat, 0x51a11) * 15;
    }
    return pts;
  };
  actions.sort((a, b) => scoreAction(b) - scoreAction(a));
  if (level === "master" && actions.length > 1 && seededRand(match, seat, 0x91ee) < 0.12) {
    return actions[1]!;
  }
  return actions[0]!;
}

function estimatedHandPoints(hand: Card[]): number {
  return hand.reduce((s, c) => s + scoreValue(c.rank), 0);
}

function discardPainWithJitter(
  match: MatchState,
  seat: number,
  level: AiLevel,
  card: Card
): number {
  let p = scoreValue(card.rank);
  if (level !== "skilled") return p;
  if (seededRand(match, seat, 0xace0 + card.id.length) * 100 >= SKILLED_ACE_FACE_JITTER_PCT) return p;
  if (card.rank === "A") p += SKILLED_ACE_BONUS;
  else if (["J", "Q", "K"].includes(card.rank)) p += SKILLED_FACE_BONUS;
  return p;
}

function chooseDiscard(match: MatchState, seat: number, level: AiLevel): GameAction {
  const hand = match.hand.hands[seat];
  const legal = legalDiscardCandidates(hand, match.hand.tableMelds);
  if (legal.length === 0) {
    throw new Error("No legal discard (wilds cannot be discarded; hand may be all wilds before forced draw)");
  }

  if (level === "novice") {
    return { type: "discard", cardId: pickUniformElement(legal).id };
  }

  if (level === "casual" && randomIntBelow(100) < 42) {
    return { type: "discard", cardId: pickUniformElement(legal).id };
  }

  if (level === "skilled" || level === "casual") {
    const ranked = [...legal].sort((a, b) => discardPainWithJitter(match, seat, level, b) - discardPainWithJitter(match, seat, level, a));
    return { type: "discard", cardId: ranked[0]!.id };
  }

  const scoreDiscard = (c: Card) => {
    const rest = hand.filter((x) => x.id !== c.id);
    return estimatedHandPoints(rest);
  };

  const scored = legal.map((c) => ({ c, est: scoreDiscard(c) }));
  scored.sort((a, b) => a.est - b.est);
  const bestEst = scored[0]!.est;
  const tied = scored.filter((x) => x.est === bestEst);

  if (level === "expert") {
    if (tied.length > 1 && seededRand(match, seat, 0xd15c) * 100 < EXPERT_SECOND_BEST_DISCARD_PCT) {
      const second = scored[1];
      if (second && second.est <= bestEst + 8) {
        return { type: "discard", cardId: second.c.id };
      }
    }
    return { type: "discard", cardId: tied[0]!.c.id };
  }

  tied.sort((a, b) => scoreValue(b.c.rank) - scoreValue(a.c.rank));
  return { type: "discard", cardId: tied[0]!.c.id };
}

function pileBiasedPush(
  match: MatchState,
  seat: number,
  level: AiLevel,
  top: Card,
  baseTake: boolean
): GameAction {
  if (baseTake) return { type: "choose_pickup" };

  const discard = match.hand.discard;
  const lastN = level === "skilled" ? PILE_WINDOW_SKILLED : null;
  const cnt = rankCountForTop(discard, top.rank, lastN);
  const r = seededRand(match, seat, 0xd2a7 + cnt);

  if (level === "skilled") {
    if (cnt >= PILE_RANK_HIGH) {
      return r < PILE_FAVOR_PUSH_WHEN_HIGH ? { type: "choose_push" } : { type: "choose_pickup" };
    }
    if (cnt <= PILE_RANK_LOW) {
      return r < PILE_SPECULATIVE_PICKUP_WHEN_LOW ? { type: "choose_pickup" } : { type: "choose_push" };
    }
    return { type: "choose_push" };
  }

  if (level === "expert" || level === "master") {
    if (cnt >= PILE_RANK_HIGH) {
      return r < PILE_FAVOR_PUSH_EXPERT_HIGH ? { type: "choose_push" } : { type: "choose_pickup" };
    }
    if (cnt <= PILE_RANK_LOW) {
      return r < PILE_SPECULATIVE_PICKUP_EXPERT_LOW ? { type: "choose_pickup" } : { type: "choose_push" };
    }
    return { type: "choose_push" };
  }

  return { type: "choose_push" };
}

function chooseDrawAction(match: MatchState, seat: number, level: AiLevel): GameAction {
  const top = discardTop(match.hand);
  if (!top) return { type: "choose_push" };
  const hand = match.hand.hands[seat];

  if (level === "novice") {
    return pickUniformElement([{ type: "choose_pickup" }, { type: "choose_push" }] as GameAction[]);
  }

  if (level === "casual" && randomIntBelow(100) < 38) {
    return pickUniformElement([{ type: "choose_pickup" }, { type: "choose_push" }] as GameAction[]);
  }

  const sameRank = hand.some((c) => c.rank === top.rank);
  const builds = pickupBuildsObjective(match.hand, seat, top);
  const takeBase = sameRank || top.isWild || builds;

  if (level === "skilled") {
    return pileBiasedPush(match, seat, level, top, takeBase);
  }

  if (level === "casual") {
    return pileBiasedPush(match, seat, "expert", top, takeBase);
  }

  if (level === "expert" || level === "master") {
    return pileBiasedPush(match, seat, level, top, takeBase);
  }

  return { type: "choose_push" };
}

function choosePostDrawAction(match: MatchState, seat: number, level: AiLevel): GameAction {
  const handState = match.hand;
  const hand = handState.hands[seat];
  const objective = handState.objective;

  if (!handState.laidDown[seat]) {
    const candidate = findLaydownForObjective(objective, hand);
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
    const danger = estimatedHandPoints(hand);
    if (level === "expert" || level === "master") {
      const rw = tryReplaceWildRanked(match, seat, level, danger);
      if (rw) return rw;
    }

    const bestAdd = chooseBestAddToMeld(match, seat, hand, objective);
    if (bestAdd) return bestAdd;
  }

  return chooseDiscard(match, seat, level);
}

export function chooseAiAction(match: MatchState, seat: number, level: AiLevel | string): GameAction {
  const lv = normalizeAiLevel(String(level));
  const phase = match.hand.turnPhase;
  if (phase === "draw_choice") return chooseDrawAction(match, seat, lv);
  if (phase === "action" || phase === "discard_required") return choosePostDrawAction(match, seat, lv);
  return { type: "choose_pickup" };
}

export function runAiTurn(initial: MatchState, seat: number, level: AiLevel | string): MatchState {
  const lv = normalizeAiLevel(String(level));
  let state = initial;
  for (let i = 0; i < 12 && state.status === "in_hand" && state.hand.activeSeat === seat; i += 1) {
    const action = chooseAiAction(state, seat, lv);
    state = applyAction(state, seat, action);
    if (state.hand.turnPhase === "draw_choice") break;
  }
  return state;
}
