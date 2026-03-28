import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import { httpServer } from "./index.js";
import { initDb, resetDb } from "./db.js";

function serverPort(): number {
  const addr = httpServer.address();
  if (addr == null || typeof addr === "string") throw new Error("Server not listening");
  return addr.port;
}

describe("Socket.IO (integration)", () => {
  beforeAll(async () => {
    initDb();
    resetDb(false);
    if (!httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("room:create returns a room code", async () => {
    const { app } = await import("./index.js");
    const user = `sock_${Date.now()}`;
    const reg = await request(app).post("/auth/register").send({ username: user, password: "secret1234" });
    expect(reg.status).toBe(200);
    const token = reg.body.token as string;
    const playerId = reg.body.user.id as string;

    const socket = ioClient(`http://127.0.0.1:${serverPort()}`, { transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("connect timeout")), 5000);
      socket.on("connect", () => {
        clearTimeout(t);
        resolve();
      });
      socket.on("connect_error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    const code = await new Promise<string>((resolve, reject) => {
      socket.emit(
        "room:create",
        { playerId, name: user, token },
        (r: { ok: boolean; code?: string; error?: string }) => {
          if (r.ok && r.code) resolve(r.code);
          else reject(new Error(r.error ?? "room:create failed"));
        }
      );
    });

    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    socket.disconnect();
  });

  it("room:get returns null for missing code", async () => {
    const socket = ioClient(`http://127.0.0.1:${serverPort()}`, { transports: ["websocket"] });
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    const payload = await new Promise<{ ok: boolean; room: unknown }>((resolve) => {
      socket.emit("room:get", { code: "XXXXX" }, (r: { ok: boolean; room: unknown }) => resolve(r));
    });
    expect(payload.ok).toBe(false);
    socket.disconnect();
  });

  it("room:join then game:start with two humans", async () => {
    const { app } = await import("./index.js");
    const u1 = `sj1_${Date.now()}`;
    const u2 = `sj2_${Date.now()}`;
    const r1 = await request(app).post("/auth/register").send({ username: u1, password: "secret1234" });
    const r2 = await request(app).post("/auth/register").send({ username: u2, password: "secret1234" });
    const t1 = r1.body.token as string;
    const t2 = r2.body.token as string;
    const id1 = r1.body.user.id as string;
    const id2 = r2.body.user.id as string;

    const url = `http://127.0.0.1:${serverPort()}`;
    const s1 = ioClient(url, { transports: ["websocket"] });
    const s2 = ioClient(url, { transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      let n = 0;
      const done = () => {
        n += 1;
        if (n === 2) resolve();
      };
      const fail = (e: Error) => reject(e);
      s1.on("connect", done);
      s2.on("connect", done);
      s1.on("connect_error", fail);
      s2.on("connect_error", fail);
      setTimeout(() => reject(new Error("connect timeout")), 5000);
    });

    const code = await new Promise<string>((resolve, reject) => {
      s1.emit("room:create", { playerId: id1, name: u1, token: t1 }, (r: { ok: boolean; code?: string; error?: string }) => {
        if (r.ok && r.code) resolve(r.code);
        else reject(new Error(r.error ?? "create"));
      });
    });

    await new Promise<void>((resolve, reject) => {
      s2.emit("room:join", { code, playerId: id2, name: u2, token: t2 }, (r: { ok: boolean; error?: string }) => {
        if (r.ok) resolve();
        else reject(new Error(r.error ?? "join"));
      });
    });

    await new Promise<void>((resolve, reject) => {
      s1.emit("game:start", { code, hostId: id1, token: t1 }, (r: { ok: boolean; error?: string }) => {
        if (r.ok) resolve();
        else reject(new Error(r.error ?? "start"));
      });
    });

    const snap = await new Promise<{ ok: boolean; room: { match: { status: string } | null } | null }>((resolve) => {
      s1.emit("room:get", { code }, (r: { ok: boolean; room: { match: { status: string } | null } | null }) => resolve(r));
    });
    expect(snap.ok).toBe(true);
    expect(snap.room?.match?.status).toBe("in_hand");

    s1.disconnect();
    s2.disconnect();
  });
});
