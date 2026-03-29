import { rankValue } from "./cards.js";
import { findLaydownForObjective, validateMeld } from "./rules.js";
import type { Card, Objective, Rank } from "./types.js";

const SUIT_ORDER: Record<string, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
  joker: 4
};

function suitKey(c: Card): number {
  if (c.suit === "joker") return 4;
  return SUIT_ORDER[c.suit] ?? 9;
}

/** Sort one meld group for hand rail (same rules as table meld display). */
export function sortMeldGroupForHand(cards: Card[]): Card[] {
  if (cards.length <= 1) return [...cards];
  const naturals = cards.filter((c) => !c.isWild && c.rank !== "JOKER");
  const setRanks = new Set(naturals.map((c) => c.rank));
  const type: "run" | "set" = setRanks.size <= 1 ? "set" : "run";
  const copy = [...cards];
  if (type === "set") {
    return copy.sort((a, b) => {
      if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
      if (a.rank !== b.rank) return rankValue(a.rank) - rankValue(b.rank);
      return suitKey(a) - suitKey(b);
    });
  }
  const v = validateMeld("run", copy);
  const merged = v.valid ? v.assignments ?? {} : {};
  return copy.sort((a, b) => {
    const key = (c: Card) => {
      if (!c.isWild && c.rank !== "JOKER") return rankValue(c.rank);
      const r = merged[c.id];
      return r != null ? rankValue(r) : 999;
    };
    return key(a) - key(b);
  });
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const out: T[][] = [];
  const cur: T[] = [];
  function rec(start: number) {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]!);
      rec(i + 1);
      cur.pop();
    }
  }
  rec(0);
  return out;
}

function firstValidMeld(pool: Card[], meldType: "run" | "set", size: number): Card[] | null {
  if (pool.length < size) return null;
  for (const combo of combinations(pool, size)) {
    if (validateMeld(meldType, combo).valid) return combo;
  }
  return null;
}

function idsOf(cards: Card[]): Set<string> {
  return new Set(cards.map((c) => c.id));
}

function sortLeftoversDefault(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
    if (a.suit !== b.suit) return suitKey(a) - suitKey(b);
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

/** Cluster naturals by rank; wilds at end. Groups ordered by size desc, then rank. */
function sortSetsClustered(cards: Card[]): Card[] {
  const wilds = cards.filter((c) => c.isWild || c.rank === "JOKER");
  const naturals = cards.filter((c) => !c.isWild && c.rank !== "JOKER");
  const byRank = new Map<Rank, Card[]>();
  for (const c of naturals) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  for (const arr of byRank.values()) {
    arr.sort((a, b) => suitKey(a) - suitKey(b));
  }
  const groups = [...byRank.values()];
  groups.sort((a, b) => b.length - a.length || rankValue(a[0]!.rank) - rankValue(b[0]!.rank));
  wilds.sort((a, b) => suitKey(a) - suitKey(b));
  return [...groups.flat(), ...wilds];
}

/** Same suit together, ascending rank within suit; wilds last. */
function sortRunsBySuit(cards: Card[]): Card[] {
  const wilds = cards.filter((c) => c.isWild || c.rank === "JOKER" || c.suit === "joker");
  const naturals = cards.filter((c) => !c.isWild && c.rank !== "JOKER" && c.suit !== "joker");
  const bySuit = new Map<string, Card[]>();
  for (const c of naturals) {
    const s = c.suit as string;
    const arr = bySuit.get(s) ?? [];
    arr.push(c);
    bySuit.set(s, arr);
  }
  const order: Card[] = [];
  for (const s of ["clubs", "diamonds", "hearts", "spades"] as const) {
    const arr = bySuit.get(s);
    if (!arr?.length) continue;
    arr.sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
    order.push(...arr);
  }
  wilds.sort((a, b) => {
    if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
    return suitKey(a) - suitKey(b);
  });
  order.push(...wilds);
  return order;
}

/**
 * RUN4_SET4 display order: prefer leading with a run of 4, then a set of 4.
 * If only one decomposition covers all cards, use it; when comparing strategies, run-first wins ties.
 */
function sortRun4Set4Heuristic(cards: Card[]): Card[] {
  const run4 = firstValidMeld(cards, "run", 4);
  const usedRun = run4 ? idsOf(run4) : new Set<string>();
  const afterRun = cards.filter((c) => !usedRun.has(c.id));
  const set4 = firstValidMeld(afterRun, "set", 4);
  const usedSet = set4 ? idsOf(set4) : new Set<string>();
  const rest = cards.filter((c) => !usedRun.has(c.id) && !usedSet.has(c.id));

  const out: Card[] = [];
  if (run4) out.push(...sortMeldGroupForHand(run4));
  if (set4) out.push(...sortMeldGroupForHand(set4));
  out.push(...sortLeftoversDefault(rest));
  if (out.length === cards.length) return out;

  const setFirst = firstValidMeld(cards, "set", 4);
  const usedS = setFirst ? idsOf(setFirst) : new Set<string>();
  const afterSet = cards.filter((c) => !usedS.has(c.id));
  const runSecond = firstValidMeld(afterSet, "run", 4);
  const usedR2 = runSecond ? idsOf(runSecond) : new Set<string>();
  const rest2 = cards.filter((c) => !usedS.has(c.id) && !usedR2.has(c.id));
  const out2: Card[] = [];
  if (setFirst) out2.push(...sortMeldGroupForHand(setFirst));
  if (runSecond) out2.push(...sortMeldGroupForHand(runSecond));
  out2.push(...sortLeftoversDefault(rest2));
  if (out2.length === cards.length) return out2;

  return sortRunsBySuit(cards);
}

/**
 * Contextual order for the hand rail: objective-first when a full laydown exists;
 * otherwise clusters (sets), suit-runs (runs), or greedy run+set for mixed objectives.
 */
export function sortHandForObjective(objective: Objective, cards: Card[]): Card[] {
  if (cards.length <= 1) return [...cards];
  const laydown = findLaydownForObjective(objective, cards);
  if (laydown) {
    return laydown.flatMap((g) => sortMeldGroupForHand(g));
  }
  switch (objective) {
    case "TWO_SETS_OF_3":
    case "THREE_SETS_OF_3":
    case "SET_OF_8":
      return sortSetsClustered(cards);
    case "RUN_OF_7":
    case "TWO_RUNS_OF_4":
      return sortRunsBySuit(cards);
    case "RUN4_SET4":
      return sortRun4Set4Heuristic(cards);
    default:
      return sortLeftoversDefault(cards);
  }
}
