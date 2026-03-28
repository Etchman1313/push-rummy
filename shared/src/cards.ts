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

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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
