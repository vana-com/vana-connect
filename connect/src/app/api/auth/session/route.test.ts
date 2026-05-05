import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  privyUsersGet: vi.fn(),
  resolveVanaUserByPrivyEvidence: vi.fn(),
  exchangeForVanaSession: vi.fn(),
  insertRefreshToken: vi.fn(),
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
}));

async function importRoute() {
  return await import("./route");
}

const VALID_VANA_USER_ID = "vana_user_" + "0".repeat(32);

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

  it("verifies Privy, resolves vanaUserId, drives Hydra, sets both cookies", async () => {
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
      expires_in: 900,
      token_type: "bearer",
    });
    mocks.insertRefreshToken.mockResolvedValue({
      id: "vana_rt_test",
      family_id: "vana_rtfam_test",
    });

    const response = await POST(
      new Request("https://account.vana.org/api/auth/session", {
        method: "POST",
        headers: { authorization: "Bearer privy-token" },
      }),
    );

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
    expect(mocks.insertRefreshToken).toHaveBeenCalledOnce();

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=ory_at_test");
    expect(setCookie).toContain("vana_access=ory_at_test");
    expect(setCookie).toContain("HttpOnly"); // vana_session HttpOnly
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.access_token).toBe("ory_at_test");
    expect(body.refresh_token).toBe("ory_rt_test");
    expect(body.token_type).toBe("Bearer");
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
