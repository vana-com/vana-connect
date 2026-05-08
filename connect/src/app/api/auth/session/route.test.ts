import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  privyUsersGet: vi.fn(),
  resolveVanaUserByPrivyEvidence: vi.fn(),
  exchangeForVanaSession: vi.fn(),
  insertRefreshToken: vi.fn(),
  insertActiveSession: vi.fn(),
}));

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    users() {
      return { get: mocks.privyUsersGet };
    }
  },
}));

vi.mock("@/lib/db/account", () => ({
  resolveVanaUserByPrivyEvidence: mocks.resolveVanaUserByPrivyEvidence,
}));

vi.mock("@/lib/auth/hydra-headless-oidc", () => ({
  exchangeForVanaSession: mocks.exchangeForVanaSession,
}));

vi.mock("@/lib/db/sessions", () => ({
  insertRefreshToken: mocks.insertRefreshToken,
  insertActiveSession: mocks.insertActiveSession,
}));

async function importRoute() {
  return await import("./route");
}

const VALID_VANA_USER_ID = `vana_user_${"0".repeat(32)}`;
const HYDRA_SID = "hydra_session_test";

/**
 * Build a JWT-looking string with a payload containing the given claims.
 * Signature segment is irrelevant — the route does not verify it (trust
 * boundary is the TLS-terminated Hydra exchange).
 */
function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = "stub-signature";
  return `${header}.${body}.${sig}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.PRIVY_APP_ID = "test-privy-app";
  process.env.PRIVY_APP_SECRET = "test-privy-secret";
});

describe("POST /api/auth/session", () => {
  it("requires a bearer identity token", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.privyUsersGet).not.toHaveBeenCalled();
  });

  it("returns 401 when Privy SDK rejects the token", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockRejectedValue(new Error("invalid token"));
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer bad-token" },
      }),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_identity_token");
  });

  it("returns 401 when the Privy user has no id", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({ id: null });
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("defaults browser bootstrap to no refresh token in the response body", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [
        { type: "google_oauth", email: "alice@example.com" },
        {
          type: "wallet",
          chain_type: "ethereum",
          connector_type: "embedded",
          wallet_client_type: "privy",
          address: "0xabc",
          id: "privy-wallet-1",
        },
      ],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
      user: { id: VALID_VANA_USER_ID },
    });
    mocks.exchangeForVanaSession.mockResolvedValue({
      access_token: "ory_at_test",
      refresh_token: "ory_rt_test",
      id_token: makeIdToken({ sub: VALID_VANA_USER_ID, sid: HYDRA_SID }),
      expires_in: 900,
      token_type: "bearer",
    });
    mocks.insertActiveSession.mockResolvedValue({});
    mocks.insertRefreshToken.mockResolvedValue({
      id: "vana_rt_test",
      family_id: "vana_rtfam_test",
    });

    const before = Date.now();
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(mocks.privyUsersGet).toHaveBeenCalledWith({
      id_token: "privy-token",
    });
    expect(mocks.resolveVanaUserByPrivyEvidence).toHaveBeenCalledWith({
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xabc",
        providerWalletId: "privy-wallet-1",
      },
    });
    expect(mocks.exchangeForVanaSession).toHaveBeenCalledWith({
      vanaUserId: VALID_VANA_USER_ID,
      clientId: "vana-account-web",
      audience: ["account.vana.org"],
      scope: ["openid", "offline"],
    });

    // Active-session insert: tokenHash = sha256(access_token) hex; sid from id_token;
    // expiresAt = now + expires_in seconds.
    const expectedTokenHash = createHash("sha256")
      .update("ory_at_test", "utf8")
      .digest("hex");
    expect(mocks.insertActiveSession).toHaveBeenCalledOnce();
    const activeSessionArg = mocks.insertActiveSession.mock.calls[0]?.[0] as {
      tokenHash: string;
      sid: string;
      vanaUserId: string;
      expiresAt: Date;
    };
    expect(activeSessionArg.tokenHash).toBe(expectedTokenHash);
    expect(activeSessionArg.sid).toBe(HYDRA_SID);
    expect(activeSessionArg.vanaUserId).toBe(VALID_VANA_USER_ID);
    expect(activeSessionArg.expiresAt).toBeInstanceOf(Date);
    const expiresMs = activeSessionArg.expiresAt.getTime();
    // 900s window with generous slack to absorb test scheduling jitter.
    expect(expiresMs).toBeGreaterThanOrEqual(before + 900 * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 900 * 1000 + 1000);

    expect(mocks.insertRefreshToken).toHaveBeenCalledOnce();
    const refreshArg = mocks.insertRefreshToken.mock.calls[0]?.[0] as {
      hydraSessionId: string;
    };
    expect(refreshArg.hydraSessionId).toBe(HYDRA_SID);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=ory_at_test");
    expect(setCookie).toContain("vana_access=ory_at_test");
    expect(setCookie).toContain("HttpOnly"); // vana_session HttpOnly
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.access_token).toBe("ory_at_test");
    expect(body.refresh_token).toBeUndefined();
    expect(body.token_type).toBe("Bearer");
  });

  it("returns the refresh token only for explicit token-mode callers", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
      user: { id: VALID_VANA_USER_ID },
    });
    mocks.exchangeForVanaSession.mockResolvedValue({
      access_token: "ory_at_test",
      refresh_token: "ory_rt_test",
      id_token: makeIdToken({ sub: VALID_VANA_USER_ID, sid: HYDRA_SID }),
      expires_in: 900,
      token_type: "bearer",
    });
    mocks.insertActiveSession.mockResolvedValue({});
    mocks.insertRefreshToken.mockResolvedValue({
      id: "vana_rt_test",
      family_id: "vana_rtfam_test",
    });

    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: {
          authorization: "Bearer privy-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "token" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refresh_token).toBe("ory_rt_test");
  });

  it("rejects malformed JSON session-mode bodies before Privy verification", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: {
          authorization: "Bearer privy-token",
          "content-type": "application/json",
        },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(mocks.privyUsersGet).not.toHaveBeenCalled();
  });

  it("rejects unknown session response modes", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: {
          authorization: "Bearer privy-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "debug" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_response_mode");
    expect(mocks.privyUsersGet).not.toHaveBeenCalled();
  });

  it("returns 502 when Hydra exchange fails", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
      user: { id: VALID_VANA_USER_ID },
    });
    mocks.exchangeForVanaSession.mockRejectedValue(new Error("hydra down"));
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("hydra_session_failed");
  });

  it("returns 502 when the Hydra id_token is missing the sid claim", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
      user: { id: VALID_VANA_USER_ID },
    });
    mocks.exchangeForVanaSession.mockResolvedValue({
      access_token: "ory_at_test",
      refresh_token: "ory_rt_test",
      // id_token without sid — issuer-config failure.
      id_token: makeIdToken({ sub: VALID_VANA_USER_ID }),
      expires_in: 900,
      token_type: "bearer",
    });
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("id_token_missing_sid");
    expect(mocks.insertActiveSession).not.toHaveBeenCalled();
    expect(mocks.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("returns 502 when the Hydra response omits the id_token entirely", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
      user: { id: VALID_VANA_USER_ID },
    });
    mocks.exchangeForVanaSession.mockResolvedValue({
      access_token: "ory_at_test",
      refresh_token: "ory_rt_test",
      // No id_token at all.
      expires_in: 900,
      token_type: "bearer",
    });
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("id_token_missing_sid");
  });

  it("returns 500 when Vana user resolution fails", async () => {
    const { POST } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockRejectedValue(
      new Error("DB unreachable"),
    );
    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("vana_user_resolution_failed");
  });
});

describe("DELETE /api/auth/session (legacy)", () => {
  it("clears both cookies", async () => {
    const { DELETE } = await importRoute();
    const response = await DELETE();
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=");
    expect(setCookie).toContain("vana_access=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
