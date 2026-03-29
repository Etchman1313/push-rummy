import type { MatchState } from "@push-rummy/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { initDb, resetDb } from "./db.js";

describe("HTTP API (integration)", () => {
  beforeAll(() => {
    initDb();
    resetDb(false);
  });

  afterAll(() => {
    resetDb(true);
  });

  it("GET /health", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.rooms).toBe("number");
  });

  it("POST /auth/register and /auth/login", async () => {
    const { app } = await import("./index.js");
    const user = `apiuser_${Date.now()}`;
    const reg = await request(app).post("/auth/register").send({ username: user, password: "secret1234" });
    expect(reg.status).toBe(200);
    expect(reg.body.ok).toBe(true);
    expect(reg.body.token).toBeTruthy();

    const log = await request(app).post("/auth/login").send({ username: user, password: "secret1234" });
    expect(log.status).toBe(200);
    expect(log.body.user.username).toBe(user);
  });

  it("GET /leaderboard", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).get("/leaderboard?mode=all&sort=rating&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it("GET /profile without auth returns 401", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).get("/profile");
    expect(res.status).toBe(401);
  });

  it("POST /admin/reset-db returns 404 when not configured", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).post("/admin/reset-db").send({});
    expect(res.status).toBe(404);
  });

  it("GET /profile returns ratings payload when authenticated", async () => {
    const { app } = await import("./index.js");
    const user = `prof_${Date.now()}`;
    const reg = await request(app).post("/auth/register").send({ username: user, password: "secret1234" });
    expect(reg.status).toBe(200);
    const res = await request(app).get("/profile").set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.username).toBe(user);
    expect(res.body.ratings).toBeTruthy();
    expect(res.body.developerHome).toBe(false);
    expect(Array.isArray(res.body.matchHistory)).toBe(true);
    expect(res.body.analytics).toBeTruthy();
  });

  it("GET /profile matchHistory lists finished matches with standings", async () => {
    const { app } = await import("./index.js");
    const { registerUser } = await import("./auth.js");
    const { finalizeCompletedMatch } = await import("./ratings.js");
    const tag = Date.now();
    const a = registerUser(`mh_a_${tag}`, "secret1234");
    const b = registerUser(`mh_b_${tag}`, "secret1234");
    const match = {
      roomCode: "ROOM",
      players: [
        { seat: 0, id: a.id, name: "a", isAi: false },
        { seat: 1, id: b.id, name: "b", isAi: false }
      ],
      currentHandIndex: 5,
      handHistory: [],
      cumulativeScores: { 0: 20, 1: 50 },
      pendingRoundSummary: null,
      hand: {} as MatchState["hand"],
      status: "finished" as const
    } as MatchState;
    finalizeCompletedMatch(`mh_match_${tag}`, "2026-01-01T00:00:00.000Z", match);

    const log = await request(app).post("/auth/login").send({ username: `mh_a_${tag}`, password: "secret1234" });
    expect(log.status).toBe(200);
    const res = await request(app).get("/profile").set("Authorization", `Bearer ${log.body.token}`);
    expect(res.status).toBe(200);
    const mine = res.body.matchHistory.find((m: { matchId: string }) => m.matchId === `mh_match_${tag}`);
    expect(mine).toBeTruthy();
    expect(mine.won).toBe(true);
    expect(mine.standings).toHaveLength(2);
    expect(res.body.analytics.streak.kind).toBe("win");
  });

  it("GET /profile sets developerHome true when DEVELOPER_USERNAME matches", async () => {
    const prev = process.env.DEVELOPER_USERNAME;
    process.env.DEVELOPER_USERNAME = "devgate_prof_user";
    const { app } = await import("./index.js");
    const reg = await request(app).post("/auth/register").send({ username: "devgate_prof_user", password: "secret1234" });
    expect(reg.status).toBe(200);
    const res = await request(app).get("/profile").set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.developerHome).toBe(true);
    if (prev === undefined) delete process.env.DEVELOPER_USERNAME;
    else process.env.DEVELOPER_USERNAME = prev;
  });

  it("POST /auth/register returns 400 for short username", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).post("/auth/register").send({ username: "ab", password: "secret1234" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("GET /leaderboard defaults invalid mode and sort", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).get("/leaderboard?mode=notamode&sort=notasort&limit=abc");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("all");
    expect(res.body.sort).toBe("rating");
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it("serves SPA index for non-API GET paths when CLIENT_DIST is set", async () => {
    const { app } = await import("./index.js");
    const res = await request(app).get("/client-only-route");
    expect(res.status).toBe(200);
    expect(res.text).toContain("fixture");
  });
});
