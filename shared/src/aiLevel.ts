import type { AiLevel } from "./types.js";

const LEGACY: Record<string, AiLevel> = {
  easy: "novice",
  medium: "skilled",
  hard: "expert"
};

export function normalizeAiLevel(raw?: string | null): AiLevel {
  if (raw == null || raw === "") return "skilled";
  const k = raw.toLowerCase();
  if (k in LEGACY) return LEGACY[k]!;
  if (k === "novice" || k === "casual" || k === "skilled" || k === "expert" || k === "master") return k;
  return "skilled";
}

export type RatingTier = "easy" | "medium" | "hard";

export function ratingTier(level: AiLevel): RatingTier {
  if (level === "novice" || level === "casual") return "easy";
  if (level === "skilled") return "medium";
  return "hard";
}

export function tierPresence(aiLevels: string[]): { easy: boolean; medium: boolean; hard: boolean } {
  const t = new Set<RatingTier>();
  for (const l of aiLevels) {
    t.add(ratingTier(normalizeAiLevel(l)));
  }
  return { easy: t.has("easy"), medium: t.has("medium"), hard: t.has("hard") };
}

/** Expected opponent strength for Elo-style updates (human vs this AI). */
export const AI_RATING_ANCHOR: Record<AiLevel, number> = {
  novice: 1060,
  casual: 1220,
  skilled: 1420,
  expert: 1780,
  master: 2000
};

export function aiOpponentAnchor(raw?: string | null): number {
  return AI_RATING_ANCHOR[normalizeAiLevel(raw)];
}
