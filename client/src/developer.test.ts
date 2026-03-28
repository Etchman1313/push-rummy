import { describe, expect, it } from "vitest";
import { DEVELOPER_USERNAME, isDeveloperUser } from "./developer";

describe("isDeveloperUser", () => {
  it("allows the designated developer username (case-insensitive)", () => {
    expect(isDeveloperUser(DEVELOPER_USERNAME)).toBe(true);
    expect(isDeveloperUser("Tim@EYTcheson.NET")).toBe(true);
  });

  it("rejects other usernames", () => {
    expect(isDeveloperUser("other@eytcheson.net")).toBe(false);
    expect(isDeveloperUser("admin")).toBe(false);
    expect(isDeveloperUser("")).toBe(false);
    expect(isDeveloperUser(undefined)).toBe(false);
    expect(isDeveloperUser(null)).toBe(false);
  });
});
