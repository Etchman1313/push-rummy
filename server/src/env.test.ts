import { afterEach, describe, expect, it } from "vitest";
import { assertProductionEnv, configuredCorsOrigins, isAdminResetConfigured } from "./env.js";

describe("env helpers", () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it("assertProductionEnv skips when not production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("assertProductionEnv throws when production JWT missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => assertProductionEnv()).toThrow(/JWT_SECRET/);
  });

  it("assertProductionEnv throws when secret too short", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short";
    expect(() => assertProductionEnv()).toThrow();
  });

  it("configuredCorsOrigins parses comma list", () => {
    process.env.CORS_ORIGIN = " https://a.com , https://b.com ";
    expect(configuredCorsOrigins()).toEqual(["https://a.com", "https://b.com"]);
  });

  it("isAdminResetConfigured", () => {
    delete process.env.ADMIN_RESET_KEY;
    expect(isAdminResetConfigured()).toBe(false);
    process.env.ADMIN_RESET_KEY = "x";
    expect(isAdminResetConfigured()).toBe(true);
  });
});
