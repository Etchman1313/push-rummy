import { findLaydownForObjective, GameAction, MatchState } from "@push-rummy/shared";
import { io, Socket } from "socket.io-client";
import { create } from "zustand";

type PublicRoom = {
  code: string;
  hostId: string;
  seats: Array<{
    seat: number;
    id: string;
    name: string;
    isAi: boolean;
    aiLevel?: "easy" | "medium" | "hard";
  }>;
  status: "lobby" | "in_hand" | "between_hands" | "finished";
  match: MatchState | null;
};

type User = { id: string; username: string };
type LeaderboardMode = "all" | "hvh" | "hvai" | "easy" | "medium" | "hard";
type LeaderboardSort = "rating" | "wins" | "winRate" | "avgPoints";
type LeaderboardRow = {
  userId: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPoints: number;
};

export type ToastVariant = "info" | "success" | "error";

export type ToastItem = { id: string; message: string; variant: ToastVariant };

type State = {
  socket: Socket | null;
  serverUrl: string;
  room: PublicRoom | null;
  user: User | null;
  token: string | null;
  leaderboardRows: LeaderboardRow[];
  leaderboardMode: LeaderboardMode;
  leaderboardSort: LeaderboardSort;
  profile: Record<string, unknown> | null;
  toasts: ToastItem[];
  error: string | null;
  pushToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadLeaderboard: () => Promise<void>;
  setLeaderboardMode: (mode: LeaderboardMode) => Promise<void>;
  setLeaderboardSort: (sort: LeaderboardSort) => Promise<void>;
  loadProfile: () => Promise<void>;
  connect: () => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  setAiSeat: (seat: number, level: "easy" | "medium" | "hard" | "open") => void;
  startGame: () => void;
  continueHand: () => void;
  sendAction: (action: GameAction) => void;
  autoLaydown: () => void;
};

function callAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & T) => {
      if (!res.ok) reject(new Error(res.error ?? "Request failed"));
      else resolve(res);
    });
  });
}

/**
 * Base URL for REST + Socket.IO.
 * - Production build: same origin as the page (e.g. Docker on :9887).
 * - Vite dev: API on port 8787 (same host as the page when not localhost).
 */
function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window === "undefined") return "http://localhost:8787";
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    return "http://localhost:8787";
  }
  const proto = window.location.protocol === "https:" ? "https" : "http";
  return `${proto}://${h}:8787`;
}

export const useGameStore = create<State>((set, get) => ({
  socket: null,
  serverUrl: defaultServerUrl(),
  room: null,
  user: null,
  token: null,
  leaderboardRows: [],
  leaderboardMode: "all",
  leaderboardSort: "rating",
  profile: null,
  toasts: [],
  error: null,
  pushToast: (message, variant = "info") => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    window.setTimeout(() => get().dismissToast(id), 6200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  register: async (username, password) => {
    try {
      const res = await fetch(`${get().serverUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "Registration failed");
      set({ user: body.user, token: body.token, error: null });
      get().pushToast("Account ready. Welcome to the table.", "success");
      await get().loadLeaderboard();
      get().connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  login: async (username, password) => {
    try {
      const res = await fetch(`${get().serverUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "Login failed");
      set({ user: body.user, token: body.token, error: null });
      get().pushToast(`Signed in as ${body.user.username}`, "success");
      await get().loadLeaderboard();
      await get().loadProfile();
      get().connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  logout: () => {
    const sock = get().socket;
    if (sock) {
      sock.removeAllListeners();
      sock.disconnect();
    }
    set({ socket: null, user: null, token: null, room: null, profile: null, error: null, toasts: [] });
  },
  loadLeaderboard: async () => {
    const { serverUrl, leaderboardMode, leaderboardSort } = get();
    const res = await fetch(`${serverUrl}/leaderboard?mode=${leaderboardMode}&sort=${leaderboardSort}&limit=50`);
    const body = await res.json();
    if (body.ok) set({ leaderboardRows: body.rows });
  },
  setLeaderboardMode: async (mode) => {
    set({ leaderboardMode: mode });
    await get().loadLeaderboard();
  },
  setLeaderboardSort: async (sort) => {
    set({ leaderboardSort: sort });
    await get().loadLeaderboard();
  },
  loadProfile: async () => {
    const token = get().token;
    if (!token) return;
    const res = await fetch(`${get().serverUrl}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json();
    if (body.ok) set({ profile: body });
  },
  connect: () => {
    const token = get().token;
    const user = get().user;
    if (!token || !user) return;
    const existing = get().socket;
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }
    const socket = io(get().serverUrl);
    socket.on("room:update", (room: PublicRoom) => {
      set({ room, error: null });
    });
    socket.on("connect_error", (err) => {
      set({ error: err.message });
      get().pushToast(`Connection error: ${err.message}`, "error");
    });
    set({ socket });
  },
  createRoom: async () => {
    const { socket, user, token } = get();
    if (!socket) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      const res = await callAck<{ code: string }>(socket, "room:create", { playerId: user.id, name: user.username, token });
      await callAck(socket, "room:get", { code: res.code });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create room";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  joinRoom: async (code) => {
    const { socket, user, token } = get();
    if (!socket) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      await callAck(socket, "room:join", { code: code.toUpperCase(), playerId: user.id, name: user.username, token });
      await callAck(socket, "room:get", { code: code.toUpperCase() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join room";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  leaveRoom: async () => {
    const { socket, room, user, token } = get();
    if (!room || !user || !token || !socket) {
      set({ room: null, error: null });
      return;
    }
    if (room.match && room.match.status !== "finished") {
      get().pushToast("You can't leave during an active match.", "error");
      return;
    }
    try {
      await callAck(socket, "room:leave", { code: room.code, playerId: user.id, token });
    } catch {
      /* still clear local view */
    }
    set({ room: null, error: null });
    get().pushToast("Left the room.", "info");
  },
  setAiSeat: async (seat, level) => {
    const { socket, room, user, token } = get();
    if (!socket || !room) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      await callAck(socket, "room:setSeat", {
        code: room.code,
        hostId: user.id,
        token,
        seat,
        config: level === "open" ? { mode: "open" } : { mode: "ai", aiLevel: level }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to configure seat";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  startGame: async () => {
    const { socket, room, user, token } = get();
    if (!socket || !room) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      await callAck(socket, "game:start", { code: room.code, hostId: user.id, token });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start game";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  continueHand: async () => {
    const { socket, room, user, token } = get();
    if (!socket || !room) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      await callAck(socket, "game:continue", { code: room.code, playerId: user.id, token });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to continue hand";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  sendAction: async (action) => {
    const { socket, room, user, token } = get();
    if (!socket || !room) return;
    try {
      if (!user || !token) throw new Error("Please log in");
      await callAck(socket, "game:action", { code: room.code, playerId: user.id, token, action });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      set({ error: msg });
      get().pushToast(msg, "error");
    }
  },
  autoLaydown: () => {
    const { room, user, sendAction } = get();
    const match = room?.match;
    if (!match) return;
    const me = match.players.find((p) => p.id === user?.id);
    if (!me) return;
    const cards = match.hand.hands[me.seat];
    const candidate = findLaydownForObjective(match.hand.objective, cards);
    if (!candidate) return;
    const melds = candidate.map((group) => {
      const natural = group.filter((c) => !c.isWild).map((c) => c.rank);
      const type: "set" | "run" = new Set(natural).size <= 1 ? "set" : "run";
      return { type, cardIds: group.map((c) => c.id) };
    });
    sendAction({ type: "laydown", melds });
  }
}));
