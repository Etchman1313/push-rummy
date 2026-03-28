import type { Card } from "@push-rummy/shared";

export const objectiveLabel: Record<string, string> = {
  TWO_SETS_OF_3: "Two Sets of 3",
  RUN4_SET4: "Run and a Set",
  TWO_RUNS_OF_4: "Two Runs of 4",
  THREE_SETS_OF_3: "Three Sets of 3",
  RUN_OF_7: "Run of 7",
  SET_OF_8: "Set of 8"
};

export const objectiveOrder: Array<keyof typeof objectiveLabel> = [
  "TWO_SETS_OF_3",
  "RUN4_SET4",
  "TWO_RUNS_OF_4",
  "THREE_SETS_OF_3",
  "RUN_OF_7",
  "SET_OF_8"
];

export function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    draw_choice: "Choose draw",
    action: "Play",
    discard_required: "Discard",
    complete: "Hand complete"
  };
  return map[phase] ?? phase.replace(/_/g, " ");
}

/** Lower cumulative is better; ties share rank (competition ranking). */
export function cumulativePlaceBySeat(results: Array<{ seat: number; cumulativeScore: number }>): Map<number, number> {
  const sorted = [...results].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const map = new Map<number, number>();
  let place = 1;
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i].cumulativeScore !== sorted[i - 1].cumulativeScore) {
      place = i + 1;
    }
    map.set(sorted[i].seat, place);
  }
  return map;
}

export function cardArtUrl(card: Card): string {
  if (card.rank === "JOKER") return "https://deckofcardsapi.com/static/img/X1.png";
  const rankMap: Record<string, string> = { "10": "0" };
  const suitMap: Record<string, string> = { clubs: "C", diamonds: "D", hearts: "H", spades: "S" };
  const r = rankMap[card.rank] ?? card.rank;
  const s = suitMap[card.suit as "clubs" | "diamonds" | "hearts" | "spades"];
  return `https://deckofcardsapi.com/static/img/${r}${s}.png`;
}
