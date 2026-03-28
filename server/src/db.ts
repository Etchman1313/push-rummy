import Database from "better-sqlite3";

export type LeaderboardMode = "all" | "hvh" | "hvai" | "easy" | "medium" | "hard";
export type LeaderboardSort = "rating" | "wins" | "winRate" | "avgPoints";

export const LEADERBOARD_MODES: LeaderboardMode[] = ["all", "hvh", "hvai", "easy", "medium", "hard"];
export const LEADERBOARD_SORTS: LeaderboardSort[] = ["rating", "wins", "winRate", "avgPoints"];
/** Upper bound for `limit` query param (full table still scanned; see docs/PERFORMANCE.md). */
export const LEADERBOARD_LIMIT_MAX = 500;

const dbPath = process.env.DB_PATH ?? "push-rummy.db";
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_ratings (
      user_id TEXT PRIMARY KEY,
      global_rating REAL NOT NULL DEFAULT 1500,
      h2h_rating REAL NOT NULL DEFAULT 1500,
      hvai_rating REAL NOT NULL DEFAULT 1500,
      hvai_easy REAL NOT NULL DEFAULT 1500,
      hvai_medium REAL NOT NULL DEFAULT 1500,
      hvai_hard REAL NOT NULL DEFAULT 1500,
      games_played INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS player_records (
      user_id TEXT PRIMARY KEY,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      total_games INTEGER NOT NULL DEFAULT 0,
      total_points REAL NOT NULL DEFAULT 0,

      wins_hvh INTEGER NOT NULL DEFAULT 0,
      losses_hvh INTEGER NOT NULL DEFAULT 0,
      games_hvh INTEGER NOT NULL DEFAULT 0,
      points_hvh REAL NOT NULL DEFAULT 0,

      wins_hvai INTEGER NOT NULL DEFAULT 0,
      losses_hvai INTEGER NOT NULL DEFAULT 0,
      games_hvai INTEGER NOT NULL DEFAULT 0,
      points_hvai REAL NOT NULL DEFAULT 0,

      wins_easy INTEGER NOT NULL DEFAULT 0,
      losses_easy INTEGER NOT NULL DEFAULT 0,
      games_easy INTEGER NOT NULL DEFAULT 0,
      points_easy REAL NOT NULL DEFAULT 0,

      wins_medium INTEGER NOT NULL DEFAULT 0,
      losses_medium INTEGER NOT NULL DEFAULT 0,
      games_medium INTEGER NOT NULL DEFAULT 0,
      points_medium REAL NOT NULL DEFAULT 0,

      wins_hard INTEGER NOT NULL DEFAULT 0,
      losses_hard INTEGER NOT NULL DEFAULT 0,
      games_hard INTEGER NOT NULL DEFAULT 0,
      points_hard REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      winner_user_id TEXT,
      table_mode TEXT NOT NULL,
      total_players INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      is_ai INTEGER NOT NULL,
      ai_level TEXT,
      seat INTEGER NOT NULL,
      placement INTEGER NOT NULL,
      total_score REAL NOT NULL,
      FOREIGN KEY (match_id) REFERENCES matches(id)
    );

    CREATE TABLE IF NOT EXISTS rating_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      before_rating REAL NOT NULL,
      after_rating REAL NOT NULL,
      delta REAL NOT NULL,
      expected_score REAL NOT NULL,
      actual_score REAL NOT NULL,
      weight REAL NOT NULL,
      k_factor REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finalized_matches (
      match_id TEXT PRIMARY KEY,
      finalized_at TEXT NOT NULL
    );
  `);
}

export function resetDb(preserveUsers: boolean): void {
  const wipe = preserveUsers
    ? [
        "DELETE FROM rating_events",
        "DELETE FROM match_participants",
        "DELETE FROM matches",
        "DELETE FROM finalized_matches",
        "UPDATE player_ratings SET global_rating=1500,h2h_rating=1500,hvai_rating=1500,hvai_easy=1500,hvai_medium=1500,hvai_hard=1500,games_played=0",
        "UPDATE player_records SET wins=0,losses=0,total_games=0,total_points=0,wins_hvh=0,losses_hvh=0,games_hvh=0,points_hvh=0,wins_hvai=0,losses_hvai=0,games_hvai=0,points_hvai=0,wins_easy=0,losses_easy=0,games_easy=0,points_easy=0,wins_medium=0,losses_medium=0,games_medium=0,points_medium=0,wins_hard=0,losses_hard=0,games_hard=0,points_hard=0"
      ]
    : [
        "DELETE FROM rating_events",
        "DELETE FROM match_participants",
        "DELETE FROM matches",
        "DELETE FROM finalized_matches",
        "DELETE FROM player_records",
        "DELETE FROM player_ratings",
        "DELETE FROM users"
      ];
  const tx = db.transaction(() => {
    for (const q of wipe) db.prepare(q).run();
  });
  tx();
}

export type LeaderboardRow = {
  userId: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPoints: number;
};

export function getLeaderboard(mode: LeaderboardMode, sort: LeaderboardSort, limit = 50): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT 
        u.id as userId, u.username,
        pr.global_rating, pr.h2h_rating, pr.hvai_rating, pr.hvai_easy, pr.hvai_medium, pr.hvai_hard,
        r.*
      FROM users u
      JOIN player_ratings pr ON pr.user_id = u.id
      JOIN player_records r ON r.user_id = u.id`
    )
    .all() as Array<Record<string, number | string>>;

  const mapped = rows.map((r) => {
    const modeFields = {
      all: { rating: "global_rating", wins: "wins", losses: "losses", games: "total_games", points: "total_points" },
      hvh: { rating: "h2h_rating", wins: "wins_hvh", losses: "losses_hvh", games: "games_hvh", points: "points_hvh" },
      hvai: { rating: "hvai_rating", wins: "wins_hvai", losses: "losses_hvai", games: "games_hvai", points: "points_hvai" },
      easy: { rating: "hvai_easy", wins: "wins_easy", losses: "losses_easy", games: "games_easy", points: "points_easy" },
      medium: { rating: "hvai_medium", wins: "wins_medium", losses: "losses_medium", games: "games_medium", points: "points_medium" },
      hard: { rating: "hvai_hard", wins: "wins_hard", losses: "losses_hard", games: "games_hard", points: "points_hard" }
    }[mode];
    const wins = Number(r[modeFields.wins]);
    const losses = Number(r[modeFields.losses]);
    const games = Number(r[modeFields.games]);
    const points = Number(r[modeFields.points]);
    const winRate = games > 0 ? wins / games : 0;
    const avgPoints = games > 0 ? points / games : 0;
    return {
      userId: String(r.userId),
      username: String(r.username),
      rating: Number(r[modeFields.rating]),
      wins,
      losses,
      winRate,
      avgPoints
    };
  });

  mapped.sort((a, b) => {
    if (sort === "wins") return b.wins - a.wins || b.rating - a.rating;
    if (sort === "winRate") return b.winRate - a.winRate || b.rating - a.rating;
    if (sort === "avgPoints") return a.avgPoints - b.avgPoints || b.rating - a.rating;
    return b.rating - a.rating;
  });
  return mapped.slice(0, limit);
}
