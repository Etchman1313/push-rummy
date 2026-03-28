import { Card, Rank } from "./types.js";

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

let cardCounter = 0;

function makeCard(rank: Rank, suit: Card["suit"]): Card {
  cardCounter += 1;
  return {
    id: `c_${cardCounter}`,
    rank,
    suit,
    isWild: rank === "2" || rank === "JOKER"
  };
}

export function createDoubleDeckWithJokers(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(makeCard(rank, suit));
    }
    cards.push(makeCard("JOKER", "joker"));
    cards.push(makeCard("JOKER", "joker"));
  }
  return cards;
}

/** Uniform integer in [0, maxExclusive) using crypto when available (unbiased). */
export function randomIntBelow(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("randomIntBelow: maxExclusive must be positive");
  const c = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!c) {
    return Math.floor(Math.random() * maxExclusive);
  }
  const buf = new Uint32Array(1);
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
  let x: number;
  do {
    c(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % maxExclusive;
}

export function pickUniformElement<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickUniformElement: empty array");
  return items[randomIntBelow(items.length)]!;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomIntBelow(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardFace(card: Card): string {
  return card.suit === "joker" ? "JOKER" : `${card.rank}${card.suit[0].toUpperCase()}`;
}

export function rankValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  if (rank === "JOKER") return 0;
  return Number(rank);
}

export function scoreValue(rank: Rank): number {
  if (rank === "JOKER") return 50;
  if (rank === "2") return 25;
  if (rank === "A") return 20;
  if (["10", "J", "Q", "K"].includes(rank)) return 10;
  return 5;
}
