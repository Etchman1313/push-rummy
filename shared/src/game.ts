import { createDoubleDeckWithJokers, pickUniformElement, shuffle } from "./cards.js";
import { canAddToMeld, canReplaceWildInMeld, findLaydownForObjective, legalDiscardCandidates, validateMeld } from "./rules.js";
import { breakTieByLatestHands, scoreHand } from "./scoring.js";
import { Card, HandState, MatchState, Meld, Objective, PlayerInfo } from "./types.js";

const OBJECTIVES: Objective[] = [
  "TWO_SETS_OF_3",
  "RUN4_SET4",
  "TWO_RUNS_OF_4",
  "THREE_SETS_OF_3",
  "RUN_OF_7",
  "SET_OF_8"
];

export type GameAction =
  | { type: "choose_pickup" }
  | { type: "choose_push" }
  | { type: "laydown"; melds: Array<{ type: "run" | "set"; cardIds: string[] }> }
  | { type: "add_to_meld"; meldId: string; cardId: string }
  | { type: "replace_wild"; meldId: string; cardId: string }
  | { type: "discard"; cardId: string };

function drawCard(hand: HandState): Card {
  if (hand.deck.length === 0) {
    if (hand.discard.length <= 1) throw new Error("Deck exhausted");
    const top = hand.discard.pop() as Card;
    hand.deck = shuffle(hand.discard);
    hand.discard = [top];
  }
  return hand.deck.pop() as Card;
}

function createHand(players: PlayerInfo[], objective: Objective): HandState {
  const deck = shuffle(createDoubleDeckWithJokers());
  const hands: Record<number, Card[]> = {};
  const laidDown: Record<number, boolean> = {};
  const playerMelds: Record<number, Meld[]> = {};
  for (const p of players) {
    hands[p.seat] = [];
    laidDown[p.seat] = false;
    playerMelds[p.seat] = [];
  }
  for (let i = 0; i < 7; i += 1) {
    for (const p of players) hands[p.seat].push(deck.pop() as Card);
  }
  return {
    objective,
    deck,
    discard: [deck.pop() as Card],
    tableMelds: [],
    playerMelds,
    hands,
    laidDown,
    activeSeat: pickUniformElement(players.map((p) => p.seat)),
    turnPhase: "draw_choice",
    winnerSeat: null,
    lastForcedDrawEvent: null
  };
}

export function createMatch(roomCode: string, players: PlayerInfo[]): MatchState {
  const cumulativeScores: Record<number, number> = {};
  for (const p of players) cumulativeScores[p.seat] = 0;
  return {
    roomCode,
    players,
    currentHandIndex: 0,
    handHistory: [],
    cumulativeScores,
    pendingRoundSummary: null,
    hand: createHand(players, OBJECTIVES[0]),
    status: "in_hand"
  };
}

function nextSeat(match: MatchState, seat: number): number {
  const order = match.players.map((p) => p.seat).sort((a, b) => a - b);
  const idx = order.indexOf(seat);
  return order[(idx + 1) % order.length];
}

function getCardFromHand(hand: Card[], id: string): Card {
  const idx = hand.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("Card not in hand");
  return hand.splice(idx, 1)[0];
}

function enforceForcedDiscardDraw(handState: HandState): number {
  const hand = handState.hands[handState.activeSeat];
  let drawn = 0;
  let legal = legalDiscardCandidates(hand, handState.tableMelds);
  while (legal.length === 0) {
    hand.push(drawCard(handState));
    drawn += 1;
    legal = legalDiscardCandidates(hand, handState.tableMelds);
  }
  return drawn;
}

function completeHandIfNeeded(match: MatchState): void {
  if (match.hand.winnerSeat == null) return;
  const winnerSeat = match.hand.winnerSeat;
  const round: Record<number, number> = {};
  for (const p of match.players) {
    const points = p.seat === winnerSeat ? 0 : scoreHand(match.hand.hands[p.seat]);
    round[p.seat] = points;
    match.cumulativeScores[p.seat] += points;
  }
  match.handHistory.push(round);
  match.pendingRoundSummary = {
    objective: match.hand.objective,
    winnerSeat,
    results: match.players
      .map((p) => ({
        seat: p.seat,
        roundScore: round[p.seat],
        cumulativeScore: match.cumulativeScores[p.seat]
      }))
      .sort((a, b) => a.roundScore - b.roundScore)
  };
  if (match.currentHandIndex + 1 >= OBJECTIVES.length) {
    match.status = "finished";
    return;
  }
  match.status = "between_hands";
}

export function continueToNextHand(match: MatchState): MatchState {
  if (match.status !== "between_hands") return match;
  const s = structuredClone(match);
  s.currentHandIndex += 1;
  s.hand = createHand(s.players, OBJECTIVES[s.currentHandIndex]);
  s.pendingRoundSummary = null;
  s.status = "in_hand";
  return s;
}

export function getWinners(match: MatchState): number[] {
  const entries = Object.entries(match.cumulativeScores).map(([seat, score]) => [Number(seat), score] as const);
  const min = Math.min(...entries.map((x) => x[1]));
  const tied = entries.filter((x) => x[1] === min).map((x) => x[0]);
  if (tied.length <= 1) return tied;
  return breakTieByLatestHands(tied, match.handHistory);
}

export function applyAction(match: MatchState, seat: number, action: GameAction): MatchState {
  if (match.status !== "in_hand") return match;
  const s = structuredClone(match);
  const hand = s.hand;
  hand.lastForcedDrawEvent = null;
  if (seat !== hand.activeSeat) throw new Error("Not your turn");
  const playerHand = hand.hands[seat];

  if (action.type === "choose_pickup") {
    if (hand.turnPhase !== "draw_choice") throw new Error("Invalid phase");
    const card = hand.discard.pop();
    if (!card) throw new Error("No discard to pick up");
    playerHand.push(card);
    hand.turnPhase = "action";
    return s;
  }

  if (action.type === "choose_push") {
    if (hand.turnPhase !== "draw_choice") throw new Error("Invalid phase");
    const pushedDeckCard = drawCard(hand);
    const pushedDiscard = hand.discard.pop();
    if (!pushedDiscard) throw new Error("No discard to push");
    const target = nextSeat(s, seat);
    hand.hands[target].push(pushedDeckCard, pushedDiscard);
    playerHand.push(drawCard(hand));
    hand.turnPhase = "action";
    return s;
  }

  if (action.type === "laydown") {
    if (hand.turnPhase !== "action" && hand.turnPhase !== "discard_required") throw new Error("Invalid phase");
    const laidCards = action.melds.flatMap((m) => m.cardIds);
    const idSet = new Set(laidCards);
    if (idSet.size !== laidCards.length) throw new Error("Duplicate card in laydown");
    const snapshot = [...playerHand];
    const newMelds: Meld[] = [];
    for (const m of action.melds) {
      const cards = m.cardIds.map((id) => {
        const card = snapshot.find((c) => c.id === id);
        if (!card) throw new Error("Missing laydown card");
        return card;
      });
      const v = validateMeld(m.type, cards);
      if (!v.valid) throw new Error("Invalid meld");
      newMelds.push({
        id: `m_${Math.random().toString(36).slice(2, 9)}`,
        ownerSeat: seat,
        type: m.type,
        cards,
        wildAssignments: v.assignments
      });
    }
    if (!hand.laidDown[seat]) {
      const auto = findLaydownForObjective(hand.objective, newMelds.flatMap((m) => m.cards));
      if (!auto) throw new Error("Laydown does not satisfy objective");
    }
    for (const c of newMelds.flatMap((m) => m.cards)) getCardFromHand(playerHand, c.id);
    hand.tableMelds.push(...newMelds);
    hand.playerMelds[seat].push(...newMelds);
    if (!hand.laidDown[seat]) hand.laidDown[seat] = true;
    /* Going out: objective laydown can empty the hand; no discard required. */
    if (playerHand.length === 0) {
      hand.winnerSeat = seat;
      hand.turnPhase = "complete";
      completeHandIfNeeded(s);
      return s;
    }
    hand.turnPhase = "discard_required";
    const drawn = enforceForcedDiscardDraw(hand);
    if (drawn > 0) {
      hand.lastForcedDrawEvent = {
        seat,
        count: drawn,
        nonce: Date.now()
      };
    }
    return s;
  }

  if (action.type === "add_to_meld") {
    if (hand.turnPhase !== "action" && hand.turnPhase !== "discard_required") throw new Error("Invalid phase");
    if (!hand.laidDown[seat]) throw new Error("Must lay down first");
    const meld = hand.tableMelds.find((m) => m.id === action.meldId);
    if (!meld) throw new Error("Meld not found");
    const idx = playerHand.findIndex((c) => c.id === action.cardId);
    if (idx < 0) throw new Error("Card not found");
    const card = playerHand[idx];
    if (!canAddToMeld(card, meld)) throw new Error("Cannot add to meld");
    playerHand.splice(idx, 1);
    meld.cards.push(card);
    if (meld.type === "run") {
      const v = validateMeld("run", meld.cards);
      if (!v.valid) throw new Error("Invalid meld state");
      meld.wildAssignments = v.assignments;
    } else if (card.isWild) {
      const target = meld.cards.find((c) => !c.isWild)?.rank ?? "A";
      meld.wildAssignments = { ...(meld.wildAssignments ?? {}), [card.id]: target };
    }
    /* Going out: last card may be a wild — add it to any legal meld; no discard step. */
    if (playerHand.length === 0) {
      hand.winnerSeat = seat;
      hand.turnPhase = "complete";
      completeHandIfNeeded(s);
      return s;
    }
    hand.turnPhase = "discard_required";
    const drawn = enforceForcedDiscardDraw(hand);
    if (drawn > 0) {
      hand.lastForcedDrawEvent = {
        seat,
        count: drawn,
        nonce: Date.now()
      };
    }
    return s;
  }

  if (action.type === "replace_wild") {
    if (hand.turnPhase !== "action" && hand.turnPhase !== "discard_required") throw new Error("Invalid phase");
    if (!hand.laidDown[seat]) throw new Error("Must lay down first");
    const meld = hand.tableMelds.find((m) => m.id === action.meldId);
    if (!meld) throw new Error("Meld not found");
    const idx = playerHand.findIndex((c) => c.id === action.cardId);
    if (idx < 0) throw new Error("Card not found");
    const card = playerHand[idx];
    const wildId = canReplaceWildInMeld(card, meld);
    if (!wildId) throw new Error("Cannot replace wild");
    const wildIndex = meld.cards.findIndex((c) => c.id === wildId);
    const stolen = meld.cards[wildIndex];
    meld.cards[wildIndex] = card;
    playerHand[idx] = stolen;
    if (meld.wildAssignments) delete meld.wildAssignments[wildId];
    return s;
  }

  if (action.type === "discard") {
    if (hand.turnPhase !== "discard_required" && hand.turnPhase !== "action") throw new Error("Invalid phase");
    /*
     * Optional go-out: discard last natural. Wilds cannot be discarded; if the last card is wild,
     * the player must add it to a meld (add_to_meld) instead — handled above.
     */
    if (
      playerHand.length === 1 &&
      playerHand[0].id === action.cardId &&
      !playerHand[0].isWild
    ) {
      hand.winnerSeat = seat;
      playerHand.pop();
      hand.turnPhase = "complete";
      completeHandIfNeeded(s);
      return s;
    }
    const legal = legalDiscardCandidates(playerHand, hand.tableMelds).map((c) => c.id);
    if (!legal.includes(action.cardId)) throw new Error("Discard is not legal");
    const card = getCardFromHand(playerHand, action.cardId);
    hand.discard.push(card);
    hand.activeSeat = nextSeat(s, seat);
    hand.turnPhase = "draw_choice";
    return s;
  }
  return s;
}
