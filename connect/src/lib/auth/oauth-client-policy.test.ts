import { describe, expect, it } from "vitest";
import {
  createDefaultOauthClientRegistry,
  DEV_MEMORY_APP_CLIENT,
  evaluateConsentPolicy,
  type OauthClientRecord,
} from "./oauth-client-policy";

describe("createDefaultOauthClientRegistry", () => {
  it("registers the dev Memory App client by default", () => {
    const registry = createDefaultOauthClientRegistry();
    const resolved = registry.resolve("memory-app-dev");
    expect(resolved).toEqual(DEV_MEMORY_APP_CLIENT);
  });

  it("returns null for unknown, blank, null, or undefined client ids", () => {
    const registry = createDefaultOauthClientRegistry();
    expect(registry.resolve("nope")).toBeNull();
    expect(registry.resolve("")).toBeNull();
    expect(registry.resolve(null)).toBeNull();
    expect(registry.resolve(undefined)).toBeNull();
  });

  it("accepts a custom client list override", () => {
    const custom: OauthClientRecord = {
      clientId: "custom",
      displayName: "Custom",
      redirectUris: ["https://custom.example.com/cb"],
      allowedOrigins: ["https://custom.example.com"],
      allowedScopes: ["openid"],
      allowedAudiences: ["custom"],
    };
    const registry = createDefaultOauthClientRegistry([custom]);
    expect(registry.resolve("custom")).toEqual(custom);
    expect(registry.resolve("memory-app-dev")).toBeNull();
    expect(registry.list()).toEqual([custom]);
  });
});

describe("evaluateConsentPolicy", () => {
  const registry = createDefaultOauthClientRegistry();

  it("allows the dev Memory App with basic OIDC scopes and registered audience", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["openid", "profile"],
      requestedAudience: ["memory-app-dev"],
    });

    expect(decision).toEqual({
      kind: "allow",
      client: DEV_MEMORY_APP_CLIENT,
      grantScope: ["openid", "profile"],
      grantAudience: ["memory-app-dev"],
    });
  });

  it("allows when no audience is requested", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["openid"],
      requestedAudience: undefined,
    });

    expect(decision.kind).toBe("allow");
    if (decision.kind === "allow") {
      expect(decision.grantAudience).toEqual([]);
    }
  });

  it("allows when requested scope/audience arrays are empty", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: [],
      requestedAudience: [],
    });

    expect(decision.kind).toBe("allow");
    if (decision.kind === "allow") {
      expect(decision.grantScope).toEqual([]);
      expect(decision.grantAudience).toEqual([]);
    }
  });

  it("filters out duplicate and blank scopes before validating", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["openid", "openid", " ", "profile"],
      requestedAudience: undefined,
    });

    expect(decision.kind).toBe("allow");
    if (decision.kind === "allow") {
      expect(decision.grantScope).toEqual(["openid", "profile"]);
    }
  });

  it("denies an unknown client", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "ghost-app",
      requestedScope: ["openid"],
      requestedAudience: ["ghost-app"],
    });

    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("unknown_client");
    }
  });

  it("denies when client_id is missing", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: null,
      requestedScope: ["openid"],
      requestedAudience: undefined,
    });

    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("unknown_client");
    }
  });

  it("denies a disallowed scope", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["openid", "data:read"],
      requestedAudience: ["memory-app-dev"],
    });

    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("disallowed_scope");
      expect(decision.message).toContain("data:read");
    }
  });

  it("denies a disallowed audience", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["openid"],
      requestedAudience: ["personal-server"],
    });

    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("disallowed_audience");
      expect(decision.message).toContain("personal-server");
    }
  });

  it("checks scope before audience when both are disallowed", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "memory-app-dev",
      requestedScope: ["data:read"],
      requestedAudience: ["personal-server"],
    });

    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("disallowed_scope");
    }
  });
});
