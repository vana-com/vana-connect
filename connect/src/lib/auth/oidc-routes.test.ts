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
  type HandleOidcDeviceAcceptInput,
  type HandleOidcLoginInput,
  type HandleOidcLogoutInput,
  type HydraAdminClientForOidc,
  handleOidcConsent,
  handleOidcDeviceAccept,
  handleOidcLogin,
  handleOidcLogout,
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
    acceptDeviceUserCodeRequest: vi.fn().mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/auth?ok=device",
    }),
    acceptLogoutRequest: vi.fn().mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/sessions/logout?ok=true",
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

  it("rejects a resolved provider subject before accepting the login request", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcLogin(
      buildInput({
        hydra,
        resolveVanaUser: vi.fn().mockResolvedValue({
          user: { id: "did:privy:user-1" },
          created: false,
        }),
      }),
    );

    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "Resolved OIDC subject must be an opaque vana_user_id",
    });
    expect(hydra.acceptLoginRequest).not.toHaveBeenCalled();
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

  it("loads account claims before accepting consent when a loader is configured", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: MEMORY_APP_CLIENT_ID },
        subject: VANA_USER_ID,
        requested_scope: ["openid", "profile", "email"],
        requested_access_token_audience: [MEMORY_APP_CLIENT_ID],
      }),
    });
    const loadAccountClaims = vi.fn().mockResolvedValue({
      email: "user@example.com",
      linkedWallets: [
        {
          provider: "privy",
          chainType: "evm",
          address: "0xabcdef0000000000000000000000000000000001",
          isPrimary: true,
        },
      ],
    });

    const result = await handleOidcConsent(
      buildInput({ hydra, loadAccountClaims }),
    );

    expect(result.kind).toBe("redirect");
    expect(loadAccountClaims).toHaveBeenCalledWith(VANA_USER_ID);
    expect(hydra.acceptConsentRequest).toHaveBeenCalledWith(
      "consent-challenge-1",
      {
        subject: VANA_USER_ID,
        grantScope: ["openid", "profile", "email"],
        grantAccessTokenAudience: [MEMORY_APP_CLIENT_ID],
        accountClaims: {
          email: "user@example.com",
          linkedWallets: [
            {
              provider: "privy",
              chainType: "evm",
              address: "0xabcdef0000000000000000000000000000000001",
              isPrimary: true,
            },
          ],
        },
      },
    );
  });

  it("rejects a provider subject on consent before accepting requested grants", async () => {
    const hydra = fakeHydra({
      getConsentRequest: vi.fn().mockResolvedValue({
        client: { client_id: MEMORY_APP_CLIENT_ID },
        subject: "did:privy:user-1",
        requested_scope: ["openid"],
        requested_access_token_audience: [],
      }),
    });

    const result = await handleOidcConsent(buildInput({ hydra }));

    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "Hydra consent subject must be an opaque vana_user_id",
    });
    expect(hydra.acceptConsentRequest).not.toHaveBeenCalled();
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

describe("handleOidcLogout", () => {
  function buildInput(
    overrides: Partial<HandleOidcLogoutInput> = {},
  ): HandleOidcLogoutInput {
    return {
      logoutChallenge: "logout-challenge-1",
      hydra: fakeHydra(),
      ...overrides,
    };
  }

  it("returns 400 when logout_challenge is missing", async () => {
    const result = await handleOidcLogout(
      buildInput({ logoutChallenge: null }),
    );
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "Missing required logout_challenge",
    });
  });

  it("returns 400 when logout_challenge is blank", async () => {
    const result = await handleOidcLogout(
      buildInput({ logoutChallenge: "  " }),
    );
    expect(result.kind).toBe("error");
  });

  it("accepts the Hydra logout request and redirects to Hydra's redirect_to", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcLogout(buildInput({ hydra }));

    expect(hydra.acceptLogoutRequest).toHaveBeenCalledWith(
      "logout-challenge-1",
    );
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location: "https://hydra.example.com/oauth2/sessions/logout?ok=true",
    });
  });

  it("returns 502 when Hydra rejects the logout request", async () => {
    const hydra = fakeHydra({
      acceptLogoutRequest: vi
        .fn()
        .mockRejectedValue(new Error("hydra unreachable")),
    });

    const result = await handleOidcLogout(buildInput({ hydra }));

    expect(result).toEqual({
      kind: "error",
      status: 502,
      message: "Logout could not be processed",
    });
  });
});

describe("handleOidcDeviceAccept", () => {
  function buildInput(
    overrides: Partial<HandleOidcDeviceAcceptInput> = {},
  ): HandleOidcDeviceAcceptInput {
    return {
      deviceChallenge: "dev-chal-1",
      userCode: "ABCD-EFGH",
      hydra: fakeHydra(),
      ...overrides,
    };
  }

  it("returns 400 when device_challenge is missing", async () => {
    const result = await handleOidcDeviceAccept(
      buildInput({ deviceChallenge: null }),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.status).toBe(400);
  });

  it("returns 400 when user_code is missing", async () => {
    const result = await handleOidcDeviceAccept(buildInput({ userCode: null }));
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.status).toBe(400);
  });

  it("calls acceptDeviceUserCodeRequest with normalized inputs and redirects", async () => {
    const hydra = fakeHydra();
    const result = await handleOidcDeviceAccept(buildInput({ hydra }));
    expect(hydra.acceptDeviceUserCodeRequest).toHaveBeenCalledWith(
      "dev-chal-1",
      { userCode: "ABCD-EFGH" },
    );
    expect(result).toEqual({
      kind: "redirect",
      status: 303,
      location: "https://hydra.example.com/oauth2/auth?ok=device",
    });
  });
});
