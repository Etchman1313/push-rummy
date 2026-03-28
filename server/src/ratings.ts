import { MatchState, PlayerInfo } from "@push-rummy/shared";
import { db } from "./db.js";

const K_FACTOR = Number(process.env.RATING_K_FACTOR ?? 32);
const AI_WEIGHT = Number(process.env.RATING_AI_WEIGHT ?? 0.5);

const AI_ANCHOR: Record<string, number> = {
  easy: 1100,
  medium: 1400,
  hard: 1700
};

type RatedPlayer = {
  userId: string;
  seat: number;
  score: number;
  placement: number;
  isHvH: boolean;
  aiLevels: string[];
};

function expectedScore(playerRating: number, oppRating: number): number {
  return 1 / (1 + 10 ** ((oppRating - playerRating) / 400));
}

function actualFromPlacement(placement: number, totalPlayers: number): number {
  if (totalPlayers <= 1) return 1;
  return (totalPlayers - placement) / (totalPlayers - 1);
}

function getRatings(userId: string) {
  const row = db
    .prepare(
      "SELECT global_rating, h2h_rating, hvai_rating, hvai_easy, hvai_medium, hvai_hard, games_played FROM player_ratings WHERE user_id = ?"
    )
    .get(userId) as
    | {
        global_rating: number;
        h2h_rating: number;
        hvai_rating: number;
        hvai_easy: number;
        hvai_medium: number;
        hvai_hard: number;
        games_played: number;
      }
    | undefined;
  if (!row) throw new Error("Missing rating row");
  return row;
}

function updateRecordCounters(p: RatedPlayer, won: boolean): void {
  const deltaWin = won ? 1 : 0;
  const deltaLoss = won ? 0 : 1;
  db.prepare(
    `UPDATE player_records SET
      wins = wins + ?, losses = losses + ?, total_games = total_games + 1, total_points = total_points + ?,
      wins_hvh = wins_hvh + ?, losses_hvh = losses_hvh + ?, games_hvh = games_hvh + ?, points_hvh = points_hvh + ?,
      wins_hvai = wins_hvai + ?, losses_hvai = losses_hvai + ?, games_hvai = games_hvai + ?, points_hvai = points_hvai + ?,
      wins_easy = wins_easy + ?, losses_easy = losses_easy + ?, games_easy = games_easy + ?, points_easy = points_easy + ?,
      wins_medium = wins_medium + ?, losses_medium = losses_medium + ?, games_medium = games_medium + ?, points_medium = points_medium + ?,
      wins_hard = wins_hard + ?, losses_hard = losses_hard + ?, games_hard = games_hard + ?, points_hard = points_hard + ?
    WHERE user_id = ?`
  ).run(
    deltaWin,
    deltaLoss,
    p.score,
    p.isHvH ? deltaWin : 0,
    p.isHvH ? deltaLoss : 0,
    p.isHvH ? 1 : 0,
    p.isHvH ? p.score : 0,
    p.isHvH ? 0 : deltaWin,
    p.isHvH ? 0 : deltaLoss,
    p.isHvH ? 0 : 1,
    p.isHvH ? 0 : p.score,
    p.aiLevels.includes("easy") ? deltaWin : 0,
    p.aiLevels.includes("easy") ? deltaLoss : 0,
    p.aiLevels.includes("easy") ? 1 : 0,
    p.aiLevels.includes("easy") ? p.score : 0,
    p.aiLevels.includes("medium") ? deltaWin : 0,
    p.aiLevels.includes("medium") ? deltaLoss : 0,
    p.aiLevels.includes("medium") ? 1 : 0,
    p.aiLevels.includes("medium") ? p.score : 0,
    p.aiLevels.includes("hard") ? deltaWin : 0,
    p.aiLevels.includes("hard") ? deltaLoss : 0,
    p.aiLevels.includes("hard") ? 1 : 0,
    p.aiLevels.includes("hard") ? p.score : 0,
    p.userId
  );
}

export function finalizeCompletedMatch(matchId: string, startedAt: string, match: MatchState): void {
  if (match.status !== "finished") return;
  const already = db.prepare("SELECT match_id FROM finalized_matches WHERE match_id = ?").get(matchId) as { match_id: string } | undefined;
  if (already) return;

  const tx = db.transaction(() => {
    const scored = match.players
      .map((p) => ({
        player: p,
        score: match.cumulativeScores[p.seat] ?? 0
      }))
      .sort((a, b) => a.score - b.score);

    const participants = scored.map((s, i) => ({
      ...s,
      placement: i + 1
    }));
    const winner = participants[0]?.player;
    const hasAi = match.players.some((p) => p.isAi);
    const mode = hasAi ? "hvai" : "hvh";
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO matches (id, started_at, ended_at, winner_user_id, table_mode, total_players) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(matchId, startedAt, now, winner?.isAi ? null : winner?.id ?? null, mode, match.players.length);

    for (const p of participants) {
      db.prepare(
        "INSERT INTO match_participants (match_id, user_id, display_name, is_ai, ai_level, seat, placement, total_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(matchId, p.player.isAi ? null : p.player.id, p.player.name, p.player.isAi ? 1 : 0, p.player.aiLevel ?? null, p.player.seat, p.placement, p.score);
    }

    const humans = participants.filter((p) => !p.player.isAi) as Array<{ player: PlayerInfo; score: number; placement: number }>;
    for (const hp of humans) {
      const aiLevels = participants
        .filter((p) => p.player.isAi && p.player.aiLevel)
        .map((p) => p.player.aiLevel as string);
      const isHvH = !hasAi;
      const ratedPlayer: RatedPlayer = {
        userId: hp.player.id,
        seat: hp.player.seat,
        score: hp.score,
        placement: hp.placement,
        isHvH,
        aiLevels
      };
      const own = getRatings(ratedPlayer.userId);
      const opponents = participants.filter((p) => p.player.seat !== hp.player.seat);
      const oppGlobalAvg =
        opponents.reduce((sum, o) => {
          if (o.player.isAi) return sum + AI_ANCHOR[o.player.aiLevel ?? "medium"];
          return sum + getRatings(o.player.id).global_rating;
        }, 0) / opponents.length;

      const actual = actualFromPlacement(ratedPlayer.placement, participants.length);
      const expGlobal = expectedScore(own.global_rating, oppGlobalAvg);
      const weight = hasAi ? AI_WEIGHT : 1;
      const globalDelta = Math.round(K_FACTOR * weight * (actual - expGlobal));
      const newGlobal = own.global_rating + globalDelta;

      const expSegment = expectedScore(
        isHvH ? own.h2h_rating : own.hvai_rating,
        oppGlobalAvg
      );
      const segmentDelta = Math.round(K_FACTOR * weight * (actual - expSegment));
      const newSegment = (isHvH ? own.h2h_rating : own.hvai_rating) + segmentDelta;

      let easy = own.hvai_easy;
      let medium = own.hvai_medium;
      let hard = own.hvai_hard;
      if (!isHvH && aiLevels.length > 0) {
        const per = Math.round(segmentDelta / aiLevels.length);
        if (aiLevels.includes("easy")) easy += per;
        if (aiLevels.includes("medium")) medium += per;
        if (aiLevels.includes("hard")) hard += per;
      }

      db.prepare(
        `UPDATE player_ratings SET
          global_rating = ?,
          h2h_rating = ?,
          hvai_rating = ?,
          hvai_easy = ?,
          hvai_medium = ?,
          hvai_hard = ?,
          games_played = games_played + 1
        WHERE user_id = ?`
      ).run(
        newGlobal,
        isHvH ? newSegment : own.h2h_rating,
        isHvH ? own.hvai_rating : newSegment,
        easy,
        medium,
        hard,
        ratedPlayer.userId
      );

      const won = ratedPlayer.placement === 1;
      updateRecordCounters(ratedPlayer, won);

      db.prepare(
        "INSERT INTO rating_events (match_id, user_id, category, before_rating, after_rating, delta, expected_score, actual_score, weight, k_factor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(matchId, ratedPlayer.userId, "global", own.global_rating, newGlobal, globalDelta, expGlobal, actual, weight, K_FACTOR, now);

      const beforeSeg = isHvH ? own.h2h_rating : own.hvai_rating;
      db.prepare(
        "INSERT INTO rating_events (match_id, user_id, category, before_rating, after_rating, delta, expected_score, actual_score, weight, k_factor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(matchId, ratedPlayer.userId, isHvH ? "hvh" : "hvai", beforeSeg, newSegment, segmentDelta, expSegment, actual, weight, K_FACTOR, now);
    }

    db.prepare("INSERT INTO finalized_matches (match_id, finalized_at) VALUES (?, ?)").run(matchId, now);
  });

  tx();
}
