import type { Card, Rank } from "./types.js";

export function tc(id: string, rank: Rank, suit: Card["suit"], isWild?: boolean): Card {
  return {
    id,
    rank,
    suit,
    isWild: isWild ?? (rank === "2" || rank === "JOKER")
  };
}
