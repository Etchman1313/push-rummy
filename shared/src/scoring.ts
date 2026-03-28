import { scoreValue } from "./cards.js";
import { Card } from "./types.js";

export function scoreHand(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + scoreValue(c.rank), 0);
}

export function breakTieByLatestHands(
  tiedSeats: number[],
  handHistory: Array<Record<number, number>>
): number[] {
  let candidates = [...tiedSeats];
  for (let i = handHistory.length - 1; i >= 0; i -= 1) {
    const hand = handHistory[i];
    const min = Math.min(...candidates.map((s) => hand[s] ?? Number.MAX_SAFE_INTEGER));
    candidates = candidates.filter((s) => (hand[s] ?? Number.MAX_SAFE_INTEGER) === min);
    if (candidates.length <= 1) return candidates;
  }
  return candidates;
}
