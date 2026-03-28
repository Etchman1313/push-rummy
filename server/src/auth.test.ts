import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDb, resetDb } from "./db.js";
import { loginUser, registerUser, signAuthToken, verifyAuthToken } from "./auth.js";

describe("auth", () => {
  beforeAll(() => {
    initDb();
  });

  beforeEach(() => {
    resetDb(false);
  });

  afterAll(() => {
    resetDb(false);
  });

  it("registers and logs in", () => {
    const u = registerUser("alice", "secret12");
    expect(u.username).toBe("alice");
    const u2 = loginUser("alice", "secret12");
    expect(u2.id).toBe(u.id);
    const token = signAuthToken(u);
    expect(verifyAuthToken(token).username).toBe("alice");
  });

  it("rejects duplicate username", () => {
    registerUser("bob", "secret12");
    expect(() => registerUser("bob", "otherpwd12")).toThrow(/exists/);
  });

  it("rejects bad credentials", () => {
    registerUser("carl", "secret12");
    expect(() => loginUser("carl", "wrongpwd")).toThrow(/Invalid/);
  });

  it("validates input types", () => {
    expect(() => registerUser(null as unknown as string, "secret12")).toThrow();
    expect(() => loginUser("nobody", null as unknown as string)).toThrow();
  });

  it("rejects username over max length", () => {
    expect(() => registerUser(`${"x".repeat(65)}`, "secret12")).toThrow(/at most/);
  });

  it("rejects password shorter than 6", () => {
    expect(() => registerUser("gooduser", "12345")).toThrow(/at least 6/);
  });

  it("rejects login overlong username", () => {
    expect(() => loginUser("x".repeat(65), "secret12")).toThrow(/Invalid/);
  });

  it("rejects login overlong password", () => {
    registerUser("loginlen", "secret12");
    expect(() => loginUser("loginlen", `${"p".repeat(129)}`)).toThrow(/Invalid/);
  });
});
