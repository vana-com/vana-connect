import { describe, expect, it, vi } from "vitest";
import type {
  LoginEvidence,
  LoginSessionAdapter,
} from "./login-session-adapter";
import {
  createDefaultOauthClientRegistry,
  type OauthClientRecord,
} from "./oauth-client-policy";
import {
  buildLoginRedirectForOidcChallenge,
  type HandleOidcConsentInput,
  type HandleOidcLoginInput,
  type HydraAdminClientForOidc,
  handleOidcConsent,
  handleOidcLogin,
  isSafeOidcReturnTo,
} from "./oidc-routes";

const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";

const MEMORY_APP_CLIENT_ID = "memory-app-dev";

function makeRequest() {
  return new Request("https://account.vana.test/auth/oidc/login");
}

function fakeHydra(
  overrides: Partial<HydraAdminClientForOidc> = {},
): HydraAdminClientForOidc {
  return {
    getLoginRequest: vi.fn().mockResolvedValue({
      client: { client_id: MEMORY_APP_CLIENT_ID },
      requested_scope: ["openid"],
    }),
    acceptLoginRequest: vi.fn().mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/auth?ok=login",
    }),
    getConsentRequest: vi.fn().mockResolvedValue({
      client: { client_id: MEMORY_APP_CLIENT_ID },
      subject: VANA_USER_ID,
      requested_scope: ["openid", "profile"],
      requested_access_token_audience: [MEMORY_APP_CLIENT_ID],
    }),
    acceptConsentRequest: vi.fn().mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/auth?ok=consent",
    }),
    ...overrides,
  };
}

function fakeSession(evidence: LoginEvidence | null): LoginSessionAdapter {
  return {
    resolveLoginEvidence: vi.fn().mockResolvedValue(evidence),
  };
}

describe("handleOidcLogin", () => {
  function buildInput(
    overrides: Partial<HandleOidcLoginInput> = {},
  ): HandleOidcLoginInput {
    return {
      loginChallenge: "login-challenge-1",
      hydra: fakeHydra(),
      sessionAdapter: fakeSession({ privySubject: "did:privy:user-1" }),
      resolveVanaUser: vi
        .fn()
        .mockResolvedValue({ user: { id: VANA_USER_ID }, created: false }),
      request: makeRequest(),
      ...overrides,
    };
  }

  it("returns 400 when login_challenge is missing", async () => {
    const result = await handleOidcLogin(buildInput({ loginChallenge: null }));
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "Missing required login_challenge",
    });
  });

  it("returns 400 when login_challenge is blank", async () => {
    const result = await handleOidcLogin(buildInput({ loginChallenge: "  " }));
    expect(result.kind).toBe("error");
  });

  it("redirects to /login with continuation when no Privy session exists", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcLogin(
      buildInput({
        hydra,
        sessionAdapter: fakeSession(null),
      }),
    );

    expect(hydra.getLoginRequest).toHaveBeenCalledWith("login-challenge-1");
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location:
        "/login?return_to=%2Fauth%2Foidc%2Flogin%3Flogin_challenge%3Dlogin-challenge-1",
    });
  });

  it("resolves the Vana user and accepts the Hydra login request", async () => {
    const hydra = fakeHydra();
    const resolveVanaUser = vi
      .fn()
      .mockResolvedValue({ user: { id: VANA_USER_ID }, created: false });
    const evidence: LoginEvidence = {
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: { chainType: "evm", address: "0xAbC" },
    };

    const result = await handleOidcLogin(
      buildInput({
        hydra,
        sessionAdapter: fakeSession(evidence),
        resolveVanaUser,
      }),
    );

    expect(resolveVanaUser).toHaveBeenCalledWith(evidence);
    expect(hydra.acceptLoginRequest).toHaveBeenCalledWith("login-challenge-1", {
      subject: VANA_USER_ID,
    });
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location: "https://hydra.example.com/oauth2/auth?ok=login",
    });
  });
});

describe("handleOidcConsent", () => {
  function buildInput(
    overrides: Partial<HandleOidcConsentInput> = {},
  ): HandleOidcConsentInput {
    return {
      consentChallenge: "consent-challenge-1",
      hydra: fakeHydra(),
      ...overrides,
    };
  }

  it("returns 400 when consent_challenge is missing", async () => {
    const result = await handleOidcConsent(
      buildInput({ consentChallenge: null }),
    );
    expect(result.kind).toBe("error");
  });

  it("accepts consent for the dev Memory App with allowlisted scopes/audience", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(hydra.getConsentRequest).toHaveBeenCalledWith("consent-challenge-1");
    expect(hydra.acceptConsentRequest).toHaveBeenCalledWith(
      "consent-challenge-1",
      {
        subject: VANA_USER_ID,
        grantScope: ["openid", "profile"],
        grantAccessTokenAudience: [MEMORY_APP_CLIENT_ID],
      },
    );
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location: "https://hydra.example.com/oauth2/auth?ok=consent",
    });
  });

  it("rejects an unknown client without calling Hydra accept", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: "ghost-app" },
        subject: VANA_USER_ID,
        requested_scope: ["openid"],
        requested_access_token_audience: [],
      }),
    });

    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("Unknown OAuth client");
    }
    expect(hydra.acceptConsentRequest).not.toHaveBeenCalled();
  });

  it("rejects a disallowed scope", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: MEMORY_APP_CLIENT_ID },
        subject: VANA_USER_ID,
        requested_scope: ["openid", "data:read"],
        requested_access_token_audience: [MEMORY_APP_CLIENT_ID],
      }),
    });

    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("data:read");
    }
    expect(hydra.acceptConsentRequest).not.toHaveBeenCalled();
  });

  it("rejects a disallowed audience", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: MEMORY_APP_CLIENT_ID },
        subject: VANA_USER_ID,
        requested_scope: ["openid"],
        requested_access_token_audience: ["personal-server"],
      }),
    });

    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("personal-server");
    }
    expect(hydra.acceptConsentRequest).not.toHaveBeenCalled();
  });

  it("accepts the basic openid scope alone", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: MEMORY_APP_CLIENT_ID },
        subject: VANA_USER_ID,
        requested_scope: ["openid"],
        requested_access_token_audience: [],
      }),
    });

    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(result.kind).toBe("redirect");
    expect(hydra.acceptConsentRequest).toHaveBeenCalledWith(
      "consent-challenge-1",
      {
        subject: VANA_USER_ID,
        grantScope: ["openid"],
        grantAccessTokenAudience: [],
      },
    );
  });

  it("uses an injected client registry override", async () => {
    const customClient: OauthClientRecord = {
      clientId: "fixture-app",
      displayName: "Fixture",
      redirectUris: ["http://localhost:4000/cb"],
      allowedOrigins: ["http://localhost:4000"],
      allowedScopes: ["openid", "profile"],
      allowedAudiences: ["fixture-app"],
    };
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: "fixture-app" },
        subject: VANA_USER_ID,
        requested_scope: ["openid"],
        requested_access_token_audience: ["fixture-app"],
      }),
    });

    const result = await handleOidcConsent({
      consentChallenge: "consent-challenge-1",
      hydra,
      clientRegistry: createDefaultOauthClientRegistry([customClient]),
    });

    expect(result.kind).toBe("redirect");
    expect(hydra.acceptConsentRequest).toHaveBeenCalled();
  });
});

describe("buildLoginRedirectForOidcChallenge", () => {
  it("encodes the OIDC continuation URL", () => {
    expect(buildLoginRedirectForOidcChallenge("abc?def&ghi")).toBe(
      "/login?return_to=%2Fauth%2Foidc%2Flogin%3Flogin_challenge%3Dabc%253Fdef%2526ghi",
    );
  });
});

describe("isSafeOidcReturnTo", () => {
  it("accepts /auth/oidc/* paths", () => {
    expect(isSafeOidcReturnTo("/auth/oidc/login?login_challenge=x")).toBe(true);
    expect(isSafeOidcReturnTo("/auth/oidc/consent?consent_challenge=x")).toBe(
      true,
    );
  });

  it("rejects null, blank, and unrelated paths", () => {
    expect(isSafeOidcReturnTo(null)).toBe(false);
    expect(isSafeOidcReturnTo("")).toBe(false);
    expect(isSafeOidcReturnTo("/connect")).toBe(false);
  });

  it("rejects open-redirect attempts", () => {
    expect(isSafeOidcReturnTo("//evil.example.com/auth/oidc/login")).toBe(
      false,
    );
    expect(isSafeOidcReturnTo("https://evil.example.com/auth/oidc/login")).toBe(
      false,
    );
    expect(isSafeOidcReturnTo("/auth/oidc/login\r\nLocation: x")).toBe(false);
  });
});
