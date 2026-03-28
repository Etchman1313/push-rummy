import { rankValue } from "./cards.js";
import { Card, Meld, Objective, Rank } from "./types.js";

const OBJECTIVE_REQUIREMENTS: Record<
  Objective,
  Array<{ type: "run" | "set"; size: number; count: number }>
> = {
  TWO_SETS_OF_3: [{ type: "set", size: 3, count: 2 }],
  RUN4_SET4: [
    { type: "run", size: 4, count: 1 },
    { type: "set", size: 4, count: 1 }
  ],
  TWO_RUNS_OF_4: [{ type: "run", size: 4, count: 2 }],
  THREE_SETS_OF_3: [{ type: "set", size: 3, count: 3 }],
  RUN_OF_7: [{ type: "run", size: 7, count: 1 }],
  SET_OF_8: [{ type: "set", size: 8, count: 1 }]
};

function nonWild(cards: Card[]): Card[] {
  return cards.filter((c) => !c.isWild);
}

function wild(cards: Card[]): Card[] {
  return cards.filter((c) => c.isWild);
}

/** Position on the run line: 1 = A (low), 2–13 = 2–K, 14 = A (high). No wrap (K–A–2 is invalid). */
function positionToRank(p: number): Rank {
  if (p === 1 || p === 14) return "A";
  if (p >= 2 && p <= 10) return String(p) as Rank;
  if (p === 11) return "J";
  if (p === 12) return "Q";
  return "K";
}

export function isValidSet(cards: Card[]): { valid: boolean; assignments: Record<string, Rank> } {
  if (cards.length < 3) return { valid: false, assignments: {} };
  const naturals = nonWild(cards);
  if (naturals.length === 0) return { valid: true, assignments: {} };
  const target = naturals[0].rank;
  if (!naturals.every((c) => c.rank === target)) return { valid: false, assignments: {} };
  const assignments: Record<string, Rank> = {};
  for (const c of wild(cards)) assignments[c.id] = target;
  return { valid: true, assignments };
}

export function isValidRun(cards: Card[]): { valid: boolean; assignments: Record<string, Rank> } {
  if (cards.length < 3) return { valid: false, assignments: {} };
  const naturals = nonWild(cards);
  const wilds = wild(cards);
  if (naturals.length === 0) return { valid: true, assignments: {} };
  if (naturals.length >= 2) {
    const suit = naturals[0].suit;
    if (!naturals.every((c) => c.suit === suit)) return { valid: false, assignments: {} };
  }
  const len = cards.length;
  for (let start = 1; start <= 15 - len; start += 1) {
    const end = start + len - 1;
    if (end > 14) break;
    const required = Array.from({ length: len }, (_, i) => positionToRank(start + i));
    const assignments: Record<string, Rank> = {};
    const usedNatural = new Set<string>();
    let wi = 0;
    let failed = false;
    for (let i = 0; i < len; i += 1) {
      const need = required[i];
      const found = naturals.find((c) => !usedNatural.has(c.id) && c.rank === need);
      if (found) {
        usedNatural.add(found.id);
        continue;
      }
      if (wi >= wilds.length) {
        failed = true;
        break;
      }
      assignments[wilds[wi].id] = need;
      wi += 1;
    }
    if (failed) continue;
    if (usedNatural.size !== naturals.length || wi !== wilds.length) continue;
    return { valid: true, assignments };
  }
  return { valid: false, assignments: {} };
}

export function validateMeld(type: "run" | "set", cards: Card[]) {
  return type === "set" ? isValidSet(cards) : isValidRun(cards);
}

function kCombinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      cur.push(arr[i]);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

function tryConsume(cards: Card[], req: Array<{ type: "run" | "set"; size: number; count: number }>): Card[][] | null {
  if (req.length === 0) return [];
  const [head, ...tail] = req;
  const groupsNeeded = head.count;
  const combos = kCombinations(cards, head.size).filter((c) => validateMeld(head.type, c).valid);
  const pickGroups = (available: Card[], chosen: Card[][]): Card[][] | null => {
    if (chosen.length === groupsNeeded) {
      const rest = tryConsume(available, tail);
      return rest ? [...chosen, ...rest] : null;
    }
    const localCombos = kCombinations(available, head.size).filter((c) => validateMeld(head.type, c).valid);
    for (const combo of localCombos) {
      const ids = new Set(combo.map((c) => c.id));
      const next = available.filter((c) => !ids.has(c.id));
      const done = pickGroups(next, [...chosen, combo]);
      if (done) return done;
    }
    return null;
  };
  if (combos.length === 0) return null;
  return pickGroups(cards, []);
}

export function findLaydownForObjective(objective: Objective, cards: Card[]): Card[][] | null {
  const req = OBJECTIVE_REQUIREMENTS[objective];
  return tryConsume(cards, req);
}

export function canAddToMeld(card: Card, meld: Meld): boolean {
  if (meld.type === "set") {
    const assignmentRank = meld.wildAssignments
      ? Object.values(meld.wildAssignments).find((r) => r !== "JOKER")
      : undefined;
    const naturalRank = meld.cards.find((c) => !c.isWild)?.rank ?? assignmentRank;
    if (!naturalRank) return true;
    return card.isWild || card.rank === naturalRank;
  }
  return validateMeld("run", [...meld.cards, card]).valid;
}

export function legalDiscardCandidates(hand: Card[], tableMelds: Meld[]): Card[] {
  return hand.filter(
    (card) => !card.isWild && !tableMelds.some((meld) => canAddToMeld(card, meld))
  );
}

export function canReplaceWildInMeld(card: Card, meld: Meld): string | null {
  if (card.isWild) return null;
  for (const m of meld.cards) {
    if (!m.isWild) continue;
    if (meld.type === "set") {
      const target = meld.cards.find((c) => !c.isWild)?.rank ?? meld.wildAssignments?.[m.id];
      if (target && card.rank === target) return m.id;
    } else {
      const target = meld.wildAssignments?.[m.id];
      if (!target || card.rank !== target) continue;
      const otherNaturals = meld.cards.filter((c) => !c.isWild && c.id !== m.id);
      const runSuit = otherNaturals[0]?.suit;
      if (runSuit != null && card.suit !== runSuit) continue;
      return m.id;
    }
  }
  return null;
}

/** Rank a wild represents in this meld (from stored assignments or re-derived validation). */
export function representedRankForWildInMeld(card: Card, meld: Meld): Rank | undefined {
  if (!card.isWild) return undefined;
  if (meld.wildAssignments?.[card.id]) return meld.wildAssignments[card.id];
  const v = validateMeld(meld.type, meld.cards);
  return v.assignments?.[card.id];
}

/**
 * Order cards for display: runs in ascending sequence (wilds in logical slots);
 * sets with naturals first, then wilds.
 */
export function sortMeldCardsForDisplay(meld: Meld): Card[] {
  const cards = [...meld.cards];
  if (meld.type === "set") {
    return cards.sort((a, b) => {
      if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
      return rankValue(a.rank) - rankValue(b.rank);
    });
  }
  const v = validateMeld("run", cards);
  const merged: Record<string, Rank> = { ...(meld.wildAssignments ?? {}), ...(v.valid ? v.assignments : {}) };
  return cards.sort((a, b) => {
    const sortKey = (c: Card) => {
      if (!c.isWild) return rankValue(c.rank);
      const r = merged[c.id];
      return r != null ? rankValue(r) : 100;
    };
    return sortKey(a) - sortKey(b);
  });
}

