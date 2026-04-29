import { describe, expect, it, vi } from "vitest";
import type {
  LoginEvidence,
  LoginSessionAdapter,
} from "./login-session-adapter";
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

function makeRequest() {
  return new Request("https://account.vana.test/auth/oidc/login");
}

function fakeHydra(
  overrides: Partial<HydraAdminClientForOidc> = {},
): HydraAdminClientForOidc {
  return {
    getLoginRequest: vi.fn().mockResolvedValue({
      client: { client_id: "memory-app" },
      requested_scope: ["openid"],
    }),
    acceptLoginRequest: vi.fn().mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/auth?ok=login",
    }),
    getConsentRequest: vi.fn().mockResolvedValue({
      client: { client_id: "memory-app" },
      subject: VANA_USER_ID,
      requested_scope: ["openid", "profile"],
      requested_access_token_audience: ["memory-app"],
    }),
    acceptConsentRequestWithRequestedGrant: vi.fn().mockResolvedValue({
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

  it("accepts consent with the requested scopes/audience and id_token claim", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(hydra.getConsentRequest).toHaveBeenCalledWith("consent-challenge-1");
    expect(hydra.acceptConsentRequestWithRequestedGrant).toHaveBeenCalledWith(
      "consent-challenge-1",
      expect.objectContaining({
        subject: VANA_USER_ID,
        requested_scope: ["openid", "profile"],
        requested_access_token_audience: ["memory-app"],
      }),
    );
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location: "https://hydra.example.com/oauth2/auth?ok=consent",
    });
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
