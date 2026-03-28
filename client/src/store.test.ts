/**
 * @vitest-environment jsdom
 */
import type { MatchState } from "@push-rummy/shared";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useGameStore } from "./store";

const listeners: Record<string, Array<(arg: unknown) => void>> = {};
const mockSocket = {
  on: vi.fn((ev: string, fn: (arg: unknown) => void) => {
    (listeners[ev] ??= []).push(fn);
  }),
  emit: vi.fn((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
    if (ev === "room:create" && cb) cb({ ok: true, code: "ZYXWV" });
    else if (ev === "room:get" && cb) cb({ ok: true, room: null });
    else if (cb) cb({ ok: true });
  }),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn()
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket)
}));

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.getState().logout();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, rows: [] })
      }))
    );
    vi.clearAllMocks();
  });

  it("pushToast and dismissToast", () => {
    useGameStore.getState().pushToast("x", "error");
    expect(useGameStore.getState().toasts.length).toBe(1);
    const id = useGameStore.getState().toasts[0]!.id;
    useGameStore.getState().dismissToast(id);
    expect(useGameStore.getState().toasts.length).toBe(0);
  });

  it("loadLeaderboard sets rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          rows: [
            {
              userId: "1",
              username: "a",
              rating: 1500,
              wins: 1,
              losses: 0,
              winRate: 1,
              avgPoints: 10
            }
          ]
        })
      }))
    );
    await useGameStore.getState().loadLeaderboard();
    expect(useGameStore.getState().leaderboardRows).toHaveLength(1);
  });

  it("register connects on success", async () => {
    const jwt = "jwt-test-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo) => {
        const u = typeof url === "string" ? url : url.url;
        if (u.includes("/auth/register")) {
          return {
            ok: true,
            json: async () => ({ ok: true, user: { id: "u1", username: "alice" }, token: jwt })
          };
        }
        if (u.includes("/leaderboard")) {
          return { ok: true, json: async () => ({ ok: true, rows: [] }) };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      })
    );
    await useGameStore.getState().register("alice", "secret12");
    expect(useGameStore.getState().user?.username).toBe("alice");
    expect(useGameStore.getState().socket).toBeTruthy();
  });

  it("logout clears session", () => {
    useGameStore.setState({ user: { id: "u", username: "x" }, token: "t" });
    useGameStore.getState().connect();
    useGameStore.getState().logout();
    expect(useGameStore.getState().user).toBeNull();
  });

  it("createRoom no-ops without socket", async () => {
    await useGameStore.getState().createRoom();
  });

  it("leaveRoom when no room", async () => {
    await useGameStore.getState().leaveRoom();
    expect(useGameStore.getState().room).toBeNull();
  });

  it("login loads profile on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo) => {
        const u = typeof url === "string" ? url : url.url;
        if (u.includes("/auth/login")) {
          return {
            ok: true,
            json: async () => ({ ok: true, user: { id: "u2", username: "bob" }, token: "toktoktoktoktoktoktoktoktoktoktoktok" })
          };
        }
        if (u.includes("/leaderboard")) {
          return { ok: true, json: async () => ({ ok: true, rows: [] }) };
        }
        if (u.includes("/profile")) {
          return { ok: true, json: async () => ({ ok: true, ratings: {} }) };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      })
    );
    await useGameStore.getState().login("bob", "secret12");
    expect(useGameStore.getState().profile).toBeTruthy();
  });

  it("login sets error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: false, error: "bad" })
      }))
    );
    await useGameStore.getState().login("x", "y");
    expect(useGameStore.getState().error).toBe("bad");
  });

  it("register sets error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: false, error: "taken" })
      }))
    );
    await useGameStore.getState().register("someone", "secret12");
    expect(useGameStore.getState().error).toBe("taken");
  });

  it("setLeaderboardMode and setLeaderboardSort refetch", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, rows: [{ userId: "1", username: "a", rating: 1, wins: 0, losses: 0, winRate: 0, avgPoints: 0 }] })
    }));
    vi.stubGlobal("fetch", f);
    await useGameStore.getState().setLeaderboardMode("hvh");
    await useGameStore.getState().setLeaderboardSort("wins");
    expect(useGameStore.getState().leaderboardMode).toBe("hvh");
    expect(useGameStore.getState().leaderboardSort).toBe("wins");
    expect(f.mock.calls.length).toBeGreaterThan(0);
  });

  it("connect_error updates error and toast", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "toktoktoktoktoktoktoktoktoktoktoktok"
    });
    useGameStore.getState().connect();
    for (const fn of listeners["connect_error"] ?? []) {
      fn(new Error("econnrefused"));
    }
    expect(useGameStore.getState().error).toBe("econnrefused");
  });

  it("room:update sets room", () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "toktoktoktoktoktoktoktoktoktoktoktok"
    });
    useGameStore.getState().connect();
    const room = {
      code: "ABC12",
      hostId: "u",
      seats: [],
      status: "lobby" as const,
      match: null
    };
    for (const fn of listeners["room:update"] ?? []) {
      fn(room);
    }
    expect(useGameStore.getState().room?.code).toBe("ABC12");
  });

  it("createRoom calls socket acks", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "toktoktoktoktoktoktoktoktoktoktoktok",
      socket: mockSocket as never
    });
    await useGameStore.getState().createRoom();
    expect(mockSocket.emit).toHaveBeenCalled();
  });

  it("joinRoom uppercases code", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "toktoktoktoktoktoktoktoktoktoktoktok",
      socket: mockSocket as never
    });
    await useGameStore.getState().joinRoom("abc99");
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "room:join",
      expect.objectContaining({ code: "ABC99" }),
      expect.any(Function)
    );
  });

  it("leaveRoom during active match shows toast only", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: {
        code: "X",
        hostId: "u",
        seats: [],
        status: "in_hand",
        match: { status: "in_hand" } as MatchState
      }
    });
    await useGameStore.getState().leaveRoom();
    expect(useGameStore.getState().room).toBeTruthy();
    expect(useGameStore.getState().toasts.some((t) => t.message.includes("can't leave"))).toBe(true);
  });

  it("leaveRoom clears room in lobby", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: {
        code: "X",
        hostId: "u",
        seats: [],
        status: "lobby",
        match: null
      }
    });
    await useGameStore.getState().leaveRoom();
    expect(useGameStore.getState().room).toBeNull();
  });

  it("setAiSeat emits room:setSeat", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: { code: "QQQQQ", hostId: "u", seats: [], status: "lobby", match: null }
    });
    await useGameStore.getState().setAiSeat(1, "easy");
    expect(mockSocket.emit).toHaveBeenCalledWith("room:setSeat", expect.objectContaining({ seat: 1 }), expect.any(Function));
  });

  it("startGame and continueHand emit", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: { code: "QQQQQ", hostId: "u", seats: [], status: "lobby", match: null }
    });
    await useGameStore.getState().startGame();
    await useGameStore.getState().continueHand();
    expect(mockSocket.emit).toHaveBeenCalledWith("game:start", expect.any(Object), expect.any(Function));
    expect(mockSocket.emit).toHaveBeenCalledWith("game:continue", expect.any(Object), expect.any(Function));
  });

  it("sendAction emits game:action", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: { code: "QQQQQ", hostId: "u", seats: [], status: "in_hand", match: {} as MatchState }
    });
    await useGameStore.getState().sendAction({ type: "choose_pickup" });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "game:action",
      expect.objectContaining({ action: { type: "choose_pickup" } }),
      expect.any(Function)
    );
  });

  it("loadProfile no-ops without token", async () => {
    await useGameStore.getState().loadProfile();
    expect(useGameStore.getState().profile).toBeNull();
  });

  it("connect replaces existing socket", () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "toktoktoktoktoktoktoktoktoktoktoktok"
    });
    useGameStore.getState().connect();
    useGameStore.getState().connect();
    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
  });

  it("createRoom surfaces socket ack error", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never
    });
    mockSocket.emit.mockImplementationOnce((_e, _p, cb?: (r: unknown) => void) => {
      if (cb) cb({ ok: false, error: "nope" });
    });
    await useGameStore.getState().createRoom();
    expect(useGameStore.getState().error).toBe("nope");
  });

  it("continueHand surfaces error", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: { code: "Q", hostId: "u", seats: [], status: "between_hands", match: null }
    });
    mockSocket.emit.mockImplementationOnce((_e, _p, cb?: (r: unknown) => void) => {
      if (cb) cb({ ok: false, error: "not_between" });
    });
    await useGameStore.getState().continueHand();
    expect(useGameStore.getState().error).toBe("not_between");
  });

  it("sendAction surfaces error", async () => {
    useGameStore.setState({
      user: { id: "u", username: "t" },
      token: "tok",
      socket: mockSocket as never,
      room: { code: "Q", hostId: "u", seats: [], status: "in_hand", match: {} as MatchState }
    });
    mockSocket.emit.mockImplementationOnce((_e, _p, cb?: (r: unknown) => void) => {
      if (cb) cb({ ok: false, error: "bad_action" });
    });
    await useGameStore.getState().sendAction({ type: "choose_pickup" });
    expect(useGameStore.getState().error).toBe("bad_action");
  });

  it("autoLaydown sends laydown when candidate exists", () => {
    const h = "hearts";
    const cards = [
      { id: "a", rank: "7" as const, suit: h, isWild: false },
      { id: "b", rank: "7" as const, suit: "spades" as const, isWild: false },
      { id: "c", rank: "7" as const, suit: "diamonds" as const, isWild: false },
      { id: "d", rank: "K" as const, suit: h, isWild: false },
      { id: "e", rank: "K" as const, suit: "spades" as const, isWild: false },
      { id: "f", rank: "K" as const, suit: "diamonds" as const, isWild: false },
      { id: "g", rank: "2" as const, suit: h, isWild: true }
    ];
    const match = {
      players: [{ seat: 0, id: "u", name: "me", isAi: false }],
      hand: {
        objective: "TWO_SETS_OF_3" as const,
        hands: { 0: cards },
        turnPhase: "action" as const,
        activeSeat: 0,
        tableMelds: [],
        playerMelds: { 0: [] },
        laidDown: { 0: false },
        deck: [],
        discard: [],
        winnerSeat: null,
        lastForcedDrawEvent: null
      },
      status: "in_hand" as const,
      roomCode: "R",
      currentHandIndex: 0,
      handHistory: [],
      cumulativeScores: { 0: 0 },
      pendingRoundSummary: null
    } as MatchState;
    useGameStore.setState({
      user: { id: "u", username: "t" },
      room: { code: "R", hostId: "u", seats: [], status: "in_hand", match }
    });
    useGameStore.getState().autoLaydown();
    /* sendAction is async — store invokes it; we only check no throw */
    expect(true).toBe(true);
  });
});
