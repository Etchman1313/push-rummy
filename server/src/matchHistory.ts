import { db } from "./db.js";

const DEFAULT_HISTORY_LIMIT = 40;

export type MatchStanding = {
  displayName: string;
  isAi: boolean;
  aiLevel: string | null;
  seat: number;
  placement: number;
  score: number;
  userId: string | null;
};

export type UserMatchScorecard = {
  matchId: string;
  startedAt: string;
  endedAt: string;
  tableMode: "hvh" | "hvai";
  totalPlayers: number;
  myPlacement: number;
  myScore: number;
  won: boolean;
  standings: MatchStanding[];
};

export type PeriodAnalytics = {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgPoints: number | null;
};

export type MatchAnalytics = {
  last7d: PeriodAnalytics;
  last30d: PeriodAnalytics;
  streak: { kind: "win" | "loss" | "none"; length: number };
  /** Oldest → newest (left to right) for the last 20 matches */
  recentForm: Array<"W" | "L">;
};

type UserMatchRow = {
  match_id: string;
  started_at: string;
  ended_at: string;
  table_mode: string;
  total_players: number;
  my_placement: number;
  my_score: number;
};

type PartRow = {
  match_id: string;
  user_id: string | null;
  display_name: string;
  is_ai: number;
  ai_level: string | null;
  seat: number;
  placement: number;
  total_score: number;
};

function periodStats(matches: UserMatchScorecard[], sinceMs: number): PeriodAnalytics {
  const slice = matches.filter((m) => new Date(m.endedAt).getTime() >= sinceMs);
  if (slice.length === 0) {
    return { games: 0, wins: 0, losses: 0, winRate: null, avgPoints: null };
  }
  const wins = slice.filter((m) => m.won).length;
  const avgPoints = slice.reduce((s, m) => s + m.myScore, 0) / slice.length;
  return {
    games: slice.length,
    wins,
    losses: slice.length - wins,
    winRate: wins / slice.length,
    avgPoints
  };
}

export function computeMatchAnalytics(scorecardsNewestFirst: UserMatchScorecard[], nowMs = Date.now()): MatchAnalytics {
  const d7 = nowMs - 7 * 86400000;
  const d30 = nowMs - 30 * 86400000;
  const last7d = periodStats(scorecardsNewestFirst, d7);
  const last30d = periodStats(scorecardsNewestFirst, d30);

  let streak: MatchAnalytics["streak"] = { kind: "none", length: 0 };
  if (scorecardsNewestFirst.length > 0) {
    const wantWin = scorecardsNewestFirst[0]!.won;
    let len = 0;
    for (const c of scorecardsNewestFirst) {
      if (c.won === wantWin) len += 1;
      else break;
    }
    streak = { kind: wantWin ? "win" : "loss", length: len };
  }

  const recentForm = scorecardsNewestFirst
    .slice(0, 20)
    .reverse()
    .map((c) => (c.won ? "W" : "L"));

  return { last7d, last30d, streak, recentForm };
}

export function getUserMatchScorecards(userId: string, limit = DEFAULT_HISTORY_LIMIT): UserMatchScorecard[] {
  const rows = db
    .prepare(
      `SELECT m.id AS match_id, m.started_at, m.ended_at, m.table_mode, m.total_players,
              um.placement AS my_placement, um.total_score AS my_score
       FROM match_participants um
       INNER JOIN matches m ON m.id = um.match_id
       WHERE um.user_id = ?
       ORDER BY m.ended_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as UserMatchRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.match_id);
  const placeholders = ids.map(() => "?").join(",");
  const parts = db
    .prepare(
      `SELECT match_id, user_id, display_name, is_ai, ai_level, seat, placement, total_score
       FROM match_participants
       WHERE match_id IN (${placeholders})
       ORDER BY match_id ASC, placement ASC`
    )
    .all(...ids) as PartRow[];

  const byMatch = new Map<string, PartRow[]>();
  for (const p of parts) {
    const arr = byMatch.get(p.match_id) ?? [];
    arr.push(p);
    byMatch.set(p.match_id, arr);
  }

  return rows.map((r) => {
    const standings: MatchStanding[] = (byMatch.get(r.match_id) ?? []).map((p) => ({
      displayName: p.display_name,
      isAi: p.is_ai === 1,
      aiLevel: p.ai_level,
      seat: p.seat,
      placement: p.placement,
      score: p.total_score,
      userId: p.user_id
    }));
    return {
      matchId: r.match_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      tableMode: r.table_mode === "hvh" ? "hvh" : "hvai",
      totalPlayers: r.total_players,
      myPlacement: r.my_placement,
      myScore: r.my_score,
      won: r.my_placement === 1,
      standings
    };
  });
}

export function getUserMatchHistoryBundle(userId: string) {
  const matchHistory = getUserMatchScorecards(userId);
  const analytics = computeMatchAnalytics(matchHistory);
  return { matchHistory, analytics };
}
