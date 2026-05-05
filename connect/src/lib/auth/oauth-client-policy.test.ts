import { describe, expect, it } from "vitest";
import {
  checkOrigin,
  checkRedirectUri,
  createDefaultOauthClientRegistry,
  DATA_CONNECT_CLIENT,
  DEV_MEMORY_APP_CLIENT,
  evaluateConsentPolicy,
  type OauthClientRecord,
} from "./oauth-client-policy";

const HTTPS_CLIENT: OauthClientRecord = {
  clientId: "https-app",
  displayName: "HTTPS App",
  redirectUris: [
    "https://app.example.com/cb",
    "https://app.example.com/cb/alt",
  ],
  allowedOrigins: ["https://app.example.com"],
  allowedScopes: ["openid"],
  allowedAudiences: ["https-app"],
};

describe("createDefaultOauthClientRegistry", () => {
  it("registers the dev Memory App client by default", () => {
    const registry = createDefaultOauthClientRegistry();
    const resolved = registry.resolve("memory-app-dev");
    expect(resolved).toEqual(DEV_MEMORY_APP_CLIENT);
  });

  it("registers the data-connect client by default", () => {
    const registry = createDefaultOauthClientRegistry();
    const resolved = registry.resolve("data-connect");
    expect(resolved).toEqual(DATA_CONNECT_CLIENT);
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

  it("allows the data-connect device-grant scope/audience pair", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "data-connect",
      requestedScope: ["openid", "offline"],
      requestedAudience: ["account.vana.org"],
    });

    expect(decision).toEqual({
      kind: "allow",
      client: DATA_CONNECT_CLIENT,
      grantScope: ["openid", "offline"],
      grantAudience: ["account.vana.org"],
    });
  });

  it("allows a Personal Server URL audience for data-connect via pattern match", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "data-connect",
      requestedScope: ["openid", "offline"],
      requestedAudience: [
        "https://0x4ed00b8ceef2b05d3ee798a778a1e92a79f8a549.myvana.app",
      ],
    });
    expect(decision.kind).toBe("allow");
  });

  it("rejects a Personal Server URL with the wrong host shape", () => {
    const decision = evaluateConsentPolicy({
      registry,
      clientId: "data-connect",
      requestedScope: ["openid"],
      requestedAudience: ["https://evil.example.com"],
    });
    expect(decision.kind).toBe("deny");
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

describe("checkRedirectUri", () => {
  it("allows the dev Memory App localhost redirect URIs exactly", () => {
    for (const uri of DEV_MEMORY_APP_CLIENT.redirectUris) {
      const decision = checkRedirectUri(DEV_MEMORY_APP_CLIENT, uri);
      expect(decision).toEqual({ kind: "allow", redirectUri: uri });
    }
  });

  it("allows explicitly registered IPv6 loopback redirect URIs", () => {
    const client: OauthClientRecord = {
      ...HTTPS_CLIENT,
      redirectUris: ["http://[::1]:3000/cb"],
    };
    expect(checkRedirectUri(client, "http://[::1]:3000/cb")).toEqual({
      kind: "allow",
      redirectUri: "http://[::1]:3000/cb",
    });
  });

  it("allows an exact-match HTTPS redirect URI", () => {
    expect(
      checkRedirectUri(HTTPS_CLIENT, "https://app.example.com/cb"),
    ).toEqual({ kind: "allow", redirectUri: "https://app.example.com/cb" });
  });

  it("denies blank, null, or undefined redirect URIs", () => {
    for (const value of ["", "   ", null, undefined]) {
      const decision = checkRedirectUri(HTTPS_CLIENT, value);
      expect(decision.kind).toBe("deny");
      if (decision.kind === "deny") {
        expect(decision.reason).toBe("missing_redirect_uri");
      }
    }
  });

  it("denies CRLF in the raw redirect URI to block header injection", () => {
    const decision = checkRedirectUri(
      HTTPS_CLIENT,
      "https://app.example.com/cb\r\nLocation: https://evil.example.com",
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_redirect_uri");
    }
  });

  it("denies protocol-relative redirect URIs", () => {
    const decision = checkRedirectUri(HTTPS_CLIENT, "//evil.example.com/cb");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_redirect_uri");
    }
  });

  it("denies non-http(s) schemes such as javascript: or data:", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,evil",
      "file:///etc/passwd",
    ]) {
      const decision = checkRedirectUri(HTTPS_CLIENT, uri);
      expect(decision.kind).toBe("deny");
      if (decision.kind === "deny") {
        expect(decision.reason).toBe("malformed_redirect_uri");
      }
    }
  });

  it("denies http://non-loopback hosts", () => {
    const insecure: OauthClientRecord = {
      ...HTTPS_CLIENT,
      redirectUris: ["http://app.example.com/cb"],
    };
    const decision = checkRedirectUri(insecure, "http://app.example.com/cb");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_redirect_uri");
    }
  });

  it("denies a redirect URI that is not registered (no prefix matching)", () => {
    const decision = checkRedirectUri(
      HTTPS_CLIENT,
      "https://app.example.com/cb/extra",
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("unregistered_redirect_uri");
    }
  });

  it("denies subdomain mismatch even when path matches a registered URI", () => {
    const decision = checkRedirectUri(
      HTTPS_CLIENT,
      "https://evil.app.example.com/cb",
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("unregistered_redirect_uri");
    }
  });

  it("denies a malformed URL", () => {
    const decision = checkRedirectUri(HTTPS_CLIENT, "not a url");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_redirect_uri");
    }
  });
});

describe("checkOrigin", () => {
  it("allows the dev Memory App localhost origins exactly", () => {
    for (const origin of DEV_MEMORY_APP_CLIENT.allowedOrigins) {
      const decision = checkOrigin(DEV_MEMORY_APP_CLIENT, origin);
      expect(decision).toEqual({ kind: "allow", origin });
    }
  });

  it("allows explicitly registered IPv6 loopback origins", () => {
    const client: OauthClientRecord = {
      ...HTTPS_CLIENT,
      allowedOrigins: ["http://[::1]:3000"],
    };
    expect(checkOrigin(client, "http://[::1]:3000")).toEqual({
      kind: "allow",
      origin: "http://[::1]:3000",
    });
  });

  it("allows an exact-match HTTPS origin", () => {
    expect(checkOrigin(HTTPS_CLIENT, "https://app.example.com")).toEqual({
      kind: "allow",
      origin: "https://app.example.com",
    });
  });

  it("denies blank, null, or undefined origins", () => {
    for (const value of ["", "   ", null, undefined]) {
      const decision = checkOrigin(HTTPS_CLIENT, value);
      expect(decision.kind).toBe("deny");
      if (decision.kind === "deny") {
        expect(decision.reason).toBe("missing_origin");
      }
    }
  });

  it("denies CRLF in the raw origin", () => {
    const decision = checkOrigin(
      HTTPS_CLIENT,
      "https://app.example.com\r\nLocation: https://evil.example.com",
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_origin");
    }
  });

  it("denies protocol-relative origins", () => {
    const decision = checkOrigin(HTTPS_CLIENT, "//app.example.com");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_origin");
    }
  });

  it("denies origins that include a path, query, or fragment", () => {
    for (const origin of [
      "https://app.example.com/cb",
      "https://app.example.com/",
      "https://app.example.com?x=1",
      "https://app.example.com#frag",
    ]) {
      const decision = checkOrigin(HTTPS_CLIENT, origin);
      expect(decision.kind).toBe("deny");
      if (decision.kind === "deny") {
        expect(decision.reason).toBe("malformed_origin");
      }
    }
  });

  it("denies non-http(s) schemes", () => {
    for (const origin of [
      "javascript://app.example.com",
      "ftp://app.example.com",
    ]) {
      const decision = checkOrigin(HTTPS_CLIENT, origin);
      expect(decision.kind).toBe("deny");
      if (decision.kind === "deny") {
        expect(decision.reason).toBe("malformed_origin");
      }
    }
  });

  it("denies http://non-loopback origins", () => {
    const insecure: OauthClientRecord = {
      ...HTTPS_CLIENT,
      allowedOrigins: ["http://app.example.com"],
    };
    const decision = checkOrigin(insecure, "http://app.example.com");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("malformed_origin");
    }
  });

  it("denies an origin that is not registered", () => {
    const decision = checkOrigin(HTTPS_CLIENT, "https://evil.example.com");
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe("unregistered_origin");
    }
  });
});
