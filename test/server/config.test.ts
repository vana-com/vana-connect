import { describe, it, expect } from "vitest";
import { createVanaConfig } from "../../src/server/config.js";
import { ConnectError } from "../../src/core/errors.js";

const VALID_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const VALID_CONFIG = {
  privateKey: VALID_KEY,
  scopes: ["instagram.dpv1", "twitter.dpv1"],
  appUrl: "https://myapp.com",
};

describe("createVanaConfig", () => {
  it("returns correct config when all valid fields are passed", () => {
    const config = createVanaConfig(VALID_CONFIG);
    expect(config.privateKey).toBe(VALID_KEY);
    expect(config.scopes).toEqual(["instagram.dpv1", "twitter.dpv1"]);
    expect(config.appUrl).toBe("https://myapp.com");
    expect(config.environment).toBeUndefined();
  });

  it("includes optional environment field", () => {
    const config = createVanaConfig({ ...VALID_CONFIG, environment: "dev" });
    expect(config.environment).toBe("dev");
  });

  it("includes optional dataSource field", () => {
    const config = createVanaConfig({
      ...VALID_CONFIG,
      dataSource: "Instagram",
    });
    expect(config.dataSource).toBe("Instagram");
  });

  it("throws CONFIG_INVALID when privateKey is missing", () => {
    expect(() =>
      createVanaConfig({ ...VALID_CONFIG, privateKey: "" as `0x${string}` }),
    ).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }));
  });

  it("throws CONFIG_INVALID when privateKey lacks 0x prefix", () => {
    expect(() =>
      createVanaConfig({
        ...VALID_CONFIG,
        privateKey:
          "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
      }),
    ).toThrow(ConnectError);
  });

  it("throws CONFIG_INVALID when scopes is empty", () => {
    expect(() => createVanaConfig({ ...VALID_CONFIG, scopes: [] })).toThrow(
      expect.objectContaining({ code: "CONFIG_INVALID" }),
    );
  });

  it("throws CONFIG_INVALID when appUrl is missing", () => {
    expect(() => createVanaConfig({ ...VALID_CONFIG, appUrl: "" })).toThrow(
      expect.objectContaining({ code: "CONFIG_INVALID" }),
    );
  });
});
