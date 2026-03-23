import { afterEach, describe, expect, it } from "vitest";
import { resolvePersonalServerAuthConfig } from "../../src/personal-server/index.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolvePersonalServerAuthConfig", () => {
  it("returns undefined for localhost servers", () => {
    process.env.VANA_PS_TOKEN = "ps-token";

    expect(
      resolvePersonalServerAuthConfig("http://localhost:8080"),
    ).toBeUndefined();
  });

  it("uses VANA_PS_TOKEN for remote servers", () => {
    process.env.VANA_PS_TOKEN = "ps-token";

    expect(resolvePersonalServerAuthConfig("https://ps.example.com")).toEqual({
      type: "bearerToken",
      token: "ps-token",
    });
  });
});
