import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { applyAction, continueToNextHand, createMatch, GameAction, MatchState, PlayerInfo, runAiTurn } from "@push-rummy/shared";
import {
  db,
  getLeaderboard,
  initDb,
  LEADERBOARD_LIMIT_MAX,
  LEADERBOARD_MODES,
  LEADERBOARD_SORTS,
  LeaderboardMode,
  LeaderboardSort,
  resetDb
} from "./db.js";
import { loginUser, registerUser, signAuthToken, verifyAuthToken } from "./auth.js";
import { finalizeCompletedMatch } from "./ratings.js";
import { assertProductionEnv, configuredCorsOrigins, isAdminResetConfigured } from "./env.js";

assertProductionEnv();

type LobbySeat = {
  seat: number;
  id: string;
  name: string;
  isAi: boolean;
  aiLevel?: "easy" | "medium" | "hard";
  socketId?: string;
};

type Room = {
  code: string;
  seats: LobbySeat[];
  hostId: string;
  match?: MatchState;
  matchStartedAt?: string;
};

const app = express();
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

const allowCorsAny = configuredCorsOrigins();
const corsOrigin = allowCorsAny.length > 0 ? allowCorsAny : "*";

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "HEAD", "OPTIONS"]
  })
);
app.use(express.json({ limit: "48kb" }));

const authRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests; try again later" }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

initDb();

const rooms = new Map<string, Room>();
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

function roomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function aiDisplayName(level: "easy" | "medium" | "hard"): string {
  if (level === "easy") return "Scout (Easy)";
  if (level === "medium") return "Strategist (Medium)";
  return "Grandmaster (Hard)";
}

function requireSocketAuth(token: string) {
  try {
    return verifyAuthToken(token);
  } catch {
    throw new Error("Unauthorized");
  }
}

function getBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function authedUser(req: express.Request) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

function toPublicRoom(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    seats: room.seats,
    status: room.match?.status ?? "lobby",
    match: room.match ?? null
  };
}

function emitRoom(room: Room) {
  io.to(room.code).emit("room:update", toPublicRoom(room));
}

function autoRunAi(room: Room) {
  if (!room.match || room.match.status !== "in_hand") return;
  let loops = 0;
  while (loops < 8 && room.match.status === "in_hand") {
    const active = room.match.players.find((p) => p.seat === room.match!.hand.activeSeat);
    if (!active?.isAi || !active.aiLevel) break;
    room.match = runAiTurn(room.match, active.seat, active.aiLevel);
    loops += 1;
  }
}

function finalizeIfFinished(room: Room): void {
  if (!room.match || room.match.status !== "finished") return;
  const matchId = `${room.code}_${room.matchStartedAt ?? Date.now()}`;
  finalizeCompletedMatch(matchId, room.matchStartedAt ?? new Date().toISOString(), room.match);
}

io.on("connection", (socket) => {
  socket.on(
    "room:create",
    ({ playerId, name, token }: { playerId: string; name: string; token: string }, cb: (payload: unknown) => void) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== playerId) return cb({ ok: false, error: "Unauthorized identity" });
      const code = roomCode();
      const room: Room = {
        code,
        hostId: playerId,
        seats: [{ seat: 0, id: playerId, name, isAi: false, socketId: socket.id }]
      };
      rooms.set(code, room);
      socketToPlayer.set(socket.id, { roomCode: code, playerId });
      socket.join(code);
      emitRoom(room);
      cb({ ok: true, code });
    }
  );

  socket.on(
    "room:join",
    (
      { code, playerId, name, token }: { code: string; playerId: string; name: string; token: string },
      cb: (payload: unknown) => void
    ) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== playerId) return cb({ ok: false, error: "Unauthorized identity" });
      const room = rooms.get(code);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.match) return cb({ ok: false, error: "Game already started" });
      if (room.seats.some((s) => s.id === playerId)) return cb({ ok: false, error: "Duplicate player id" });
      if (room.seats.filter((s) => !s.isAi).length >= 4) return cb({ ok: false, error: "Room full" });
      const used = new Set(room.seats.map((s) => s.seat));
      let seat = 0;
      while (used.has(seat)) seat += 1;
      room.seats.push({ seat, id: playerId, name, isAi: false, socketId: socket.id });
      socketToPlayer.set(socket.id, { roomCode: code, playerId });
      socket.join(code);
      emitRoom(room);
      cb({ ok: true });
    }
  );

  socket.on(
    "room:leave",
    ({ code, playerId, token }: { code: string; playerId: string; token: string }, cb: (payload: unknown) => void) => {
      try {
        const auth = requireSocketAuth(token);
        if (auth.id !== playerId) return cb({ ok: false, error: "Unauthorized identity" });
        const room = rooms.get(code);
        if (!room) return cb({ ok: false, error: "Room not found" });
        if (room.match && room.match.status !== "finished") {
          return cb({ ok: false, error: "Cannot leave during an active match" });
        }
        room.seats = room.seats.filter((s) => s.id !== playerId);
        socket.leave(code);
        socketToPlayer.delete(socket.id);
        if (room.seats.length === 0) {
          rooms.delete(code);
          return cb({ ok: true });
        }
        if (room.hostId === playerId) room.hostId = room.seats[0].id;
        emitRoom(room);
        cb({ ok: true });
      } catch (e) {
        cb({ ok: false, error: e instanceof Error ? e.message : "Leave failed" });
      }
    }
  );

  socket.on(
    "room:setSeat",
    (
      {
        code,
        hostId,
        token,
        seat,
        config
      }: {
        code: string;
        hostId: string;
        token: string;
        seat: number;
        config: { mode: "open" | "ai"; aiLevel?: "easy" | "medium" | "hard" };
      },
      cb: (payload: unknown) => void
    ) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== hostId) return cb({ ok: false, error: "Unauthorized identity" });
      const room = rooms.get(code);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostId !== hostId) return cb({ ok: false, error: "Only host can configure seats" });
      if (room.match) return cb({ ok: false, error: "Game already started" });
      if (seat < 0 || seat > 3) return cb({ ok: false, error: "Seat out of range" });
      const existing = room.seats.find((s) => s.seat === seat);
      if (config.mode === "open") {
        if (existing?.isAi) room.seats = room.seats.filter((s) => s.seat !== seat);
      } else if (!existing) {
        const level = config.aiLevel ?? "medium";
        room.seats.push({
          seat,
          id: `ai_${seat}`,
          name: aiDisplayName(level),
          isAi: true,
          aiLevel: level
        });
      } else if (existing.isAi) {
        existing.aiLevel = config.aiLevel ?? "medium";
        existing.name = aiDisplayName(existing.aiLevel);
      } else {
        return cb({ ok: false, error: "Seat occupied by human" });
      }
      emitRoom(room);
      cb({ ok: true });
    }
  );

  socket.on(
    "game:start",
    ({ code, hostId, token }: { code: string; hostId: string; token: string }, cb: (payload: unknown) => void) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== hostId) return cb({ ok: false, error: "Unauthorized identity" });
      const room = rooms.get(code);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostId !== hostId) return cb({ ok: false, error: "Only host can start" });
      if (room.match) return cb({ ok: false, error: "Already started" });
      if (room.seats.length < 2 || room.seats.length > 4) return cb({ ok: false, error: "Requires 2-4 players" });
      const players: PlayerInfo[] = room.seats
        .sort((a, b) => a.seat - b.seat)
        .map((s) => ({ seat: s.seat, id: s.id, name: s.name, isAi: s.isAi, aiLevel: s.aiLevel }));
      room.matchStartedAt = new Date().toISOString();
      room.match = createMatch(code, players);
      autoRunAi(room);
      finalizeIfFinished(room);
      emitRoom(room);
      cb({ ok: true });
    }
  );

  socket.on(
    "game:action",
    (
      { code, playerId, token, action }: { code: string; playerId: string; token: string; action: GameAction },
      cb: (payload: unknown) => void
    ) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== playerId) return cb({ ok: false, error: "Unauthorized identity" });
      const room = rooms.get(code);
      if (!room?.match) return cb({ ok: false, error: "No active game" });
      const player = room.match.players.find((p) => p.id === playerId);
      if (!player || player.isAi) return cb({ ok: false, error: "Invalid player" });
      try {
        room.match = applyAction(room.match, player.seat, action);
        autoRunAi(room);
        finalizeIfFinished(room);
        emitRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: err instanceof Error ? err.message : "Action failed" });
      }
    }
  );

  socket.on(
    "game:continue",
    ({ code, playerId, token }: { code: string; playerId: string; token: string }, cb: (payload: unknown) => void) => {
      const auth = requireSocketAuth(token);
      if (auth.id !== playerId) return cb({ ok: false, error: "Unauthorized identity" });
      const room = rooms.get(code);
      if (!room?.match) return cb({ ok: false, error: "No active game" });
      if (room.hostId !== playerId) return cb({ ok: false, error: "Only host can continue" });
      if (room.match.status !== "between_hands") return cb({ ok: false, error: "Not waiting between hands" });
      room.match = continueToNextHand(room.match);
      autoRunAi(room);
      emitRoom(room);
      cb({ ok: true });
    }
  );

  socket.on("room:get", ({ code }: { code: string }, cb: (payload: unknown) => void) => {
    const room = rooms.get(code);
    cb({ ok: !!room, room: room ? toPublicRoom(room) : null });
  });

  socket.on("disconnect", () => {
    const entry = socketToPlayer.get(socket.id);
    if (!entry) return;
    socketToPlayer.delete(socket.id);
    const room = rooms.get(entry.roomCode);
    if (!room || room.match) return;
    room.seats = room.seats.filter((s) => s.id !== entry.playerId);
    if (room.seats.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === entry.playerId) room.hostId = room.seats[0].id;
    emitRoom(room);
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.post("/auth/register", authRouteLimiter, (req, res) => {
  try {
    const user = registerUser(req.body.username, req.body.password);
    const token = signAuthToken(user);
    res.json({ ok: true, user, token });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Registration failed" });
  }
});

app.post("/auth/login", authRouteLimiter, (req, res) => {
  try {
    const user = loginUser(req.body.username, req.body.password);
    const token = signAuthToken(user);
    res.json({ ok: true, user, token });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Login failed" });
  }
});

app.get("/profile", (req, res) => {
  const user = authedUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const ratings = db.prepare("SELECT * FROM player_ratings WHERE user_id = ?").get(user.id);
  const records = db.prepare("SELECT * FROM player_records WHERE user_id = ?").get(user.id);
  const recent = db
    .prepare(
      `SELECT match_id, category, delta, before_rating, after_rating, created_at
       FROM rating_events
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 20`
    )
    .all(user.id);
  res.json({ ok: true, user, ratings, records, recent });
});

app.get("/leaderboard", (req, res) => {
  const modeRaw = req.query.mode;
  const sortRaw = req.query.sort;
  const mode: LeaderboardMode = LEADERBOARD_MODES.includes(modeRaw as LeaderboardMode)
    ? (modeRaw as LeaderboardMode)
    : "all";
  const sort: LeaderboardSort = LEADERBOARD_SORTS.includes(sortRaw as LeaderboardSort)
    ? (sortRaw as LeaderboardSort)
    : "rating";
  const parsed = Number(req.query.limit ?? 50);
  const limit = Math.min(LEADERBOARD_LIMIT_MAX, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 50));
  res.json({ ok: true, mode, sort, rows: getLeaderboard(mode, sort, limit) });
});

app.post("/admin/reset-db", (req, res) => {
  if (!isAdminResetConfigured()) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_RESET_KEY;
  if (!expected || key !== expected) return res.status(403).json({ ok: false, error: "Forbidden" });
  resetDb(Boolean(req.body?.preserveUsers));
  res.json({ ok: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveClientDistDir(): string | null {
  const envDir = process.env.CLIENT_DIST;
  if (envDir) {
    const index = path.join(envDir, "index.html");
    if (fs.existsSync(index)) return envDir;
  }
  const nextToServer = path.join(__dirname, "../../client/dist");
  if (fs.existsSync(path.join(nextToServer, "index.html"))) return nextToServer;
  return null;
}

const clientDist = resolveClientDistDir();
if (clientDist) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/socket.io") ||
      req.path.startsWith("/auth") ||
      req.path.startsWith("/profile") ||
      req.path.startsWith("/leaderboard") ||
      req.path.startsWith("/health") ||
      req.path.startsWith("/admin")
    ) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = Number(process.env.PORT ?? 8787);
const BIND = process.env.BIND_ADDRESS ?? "0.0.0.0";

export { app, httpServer, io };

if (!process.env.VITEST) {
  httpServer.listen(PORT, BIND, () => {
    // eslint-disable-next-line no-console
    console.log(`Push Rummy listening on ${BIND}:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
  });
}
