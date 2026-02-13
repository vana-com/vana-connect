import { describe, it, expect } from "vitest";
import {
  getEnvConfig,
  ENV_CONFIG,
  DEFAULT_ENVIRONMENT,
} from "../../src/core/constants.js";

describe("getEnvConfig", () => {
  it("returns dev config for 'dev'", () => {
    const config = getEnvConfig("dev");
    expect(config).toBe(ENV_CONFIG.dev);
    expect(config.sessionRelayUrl).toContain("session-relay");
    expect(config.gatewayUrl).toContain("data-gateway");
  });

  it("returns prod config for 'prod'", () => {
    const config = getEnvConfig("prod");
    expect(config).toBe(ENV_CONFIG.prod);
  });

  it("defaults to prod when no environment is specified", () => {
    const config = getEnvConfig();
    expect(config).toBe(ENV_CONFIG[DEFAULT_ENVIRONMENT]);
    expect(config).toBe(ENV_CONFIG.prod);
  });
});
