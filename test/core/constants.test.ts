import { describe, it, expect } from "vitest";
import { getEnvConfig, ENV_CONFIG } from "../../src/core/constants.js";

describe("getEnvConfig", () => {
  it("returns the SDK URL configuration", () => {
    const config = getEnvConfig();
    expect(config).toBe(ENV_CONFIG);
    expect(config.sessionRelayUrl).toContain("session-relay");
    expect(config.gatewayUrl).toContain("data-gateway");
    expect(config.accountUrl).toBe("https://account.vana.org");
  });
});
