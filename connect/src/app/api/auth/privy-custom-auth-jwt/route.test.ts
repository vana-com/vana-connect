import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountLoginSessionToken } from "@/lib/auth/account-login-session";

const mocks = vi.hoisted(() => ({
  privyUsersGet: vi.fn(),
  resolveVanaUserByPrivyEvidence: vi.fn(),
  resolveVanaCustomAuthJwtConfig: vi.fn(),
  createVanaCustomAuthJwt: vi.fn(),
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

vi.mock("@/lib/auth/privy-custom-auth", () => ({
  resolveVanaCustomAuthJwtConfig: mocks.resolveVanaCustomAuthJwtConfig,
  createVanaCustomAuthJwt: mocks.createVanaCustomAuthJwt,
}));

async function importRoute() {
  return await import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.ACCOUNT_LOGIN_SESSION_SECRET = "test-session-secret";
  process.env.PRIVY_APP_ID = "test-privy-app";
  process.env.PRIVY_APP_SECRET = "test-privy-secret";
  mocks.resolveVanaUserByPrivyEvidence.mockResolvedValue({
    user: { id: "vana_user_1234567890abcdef" },
  });
  mocks.resolveVanaCustomAuthJwtConfig.mockReturnValue({
    privateKeyPem: "test-private-key",
    keyId: "test-key",
    issuer: "https://account.vana.org",
    audience: "test-privy-app",
  });
  mocks.createVanaCustomAuthJwt.mockReturnValue("vana.jwt.token");
});

describe("GET /api/auth/privy-custom-auth-jwt", () => {
  it("returns 401 when no login evidence is present", async () => {
    const { GET } = await importRoute();

    const response = await GET(
      new Request("https://account.vana.org/api/auth/privy-custom-auth-jwt"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: { code: "not_authenticated" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.resolveVanaUserByPrivyEvidence).not.toHaveBeenCalled();
  });

  it("mints a Vana custom-auth JWT from the account session cookie", async () => {
    const { GET } = await importRoute();
    const session = createAccountLoginSessionToken(
      {
        privySubject: "did:privy:user-1",
        email: "alice@example.com",
        embeddedWallet: {
          chainType: "evm",
          address: "0xabc",
          providerWalletId: "wallet-1",
        },
      },
      { secret: "test-session-secret", nowMs: Date.now(), ttlMs: 5000 },
    );

    const response = await GET(
      new Request("https://account.vana.org/api/auth/privy-custom-auth-jwt", {
        headers: {
          cookie: `vana_account_session=${encodeURIComponent(session)}`,
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ token: "vana.jwt.token" });
    expect(mocks.resolveVanaUserByPrivyEvidence).toHaveBeenCalledWith({
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xabc",
        providerWalletId: "wallet-1",
      },
    });
    expect(mocks.createVanaCustomAuthJwt).toHaveBeenCalledWith({
      vanaUserId: "vana_user_1234567890abcdef",
      config: {
        privateKeyPem: "test-private-key",
        keyId: "test-key",
        issuer: "https://account.vana.org",
        audience: "test-privy-app",
      },
    });
    expect(mocks.privyUsersGet).not.toHaveBeenCalled();
  });

  it("can bootstrap from a verified Privy identity token during migration", async () => {
    const { GET } = await importRoute();
    mocks.privyUsersGet.mockResolvedValue({
      id: "did:privy:user-token",
      linked_accounts: [{ type: "email", address: "token@example.com" }],
    });

    const response = await GET(
      new Request("https://account.vana.org/api/auth/privy-custom-auth-jwt", {
        headers: { authorization: "Bearer privy-id-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.privyUsersGet).toHaveBeenCalledWith({
      id_token: "privy-id-token",
    });
    expect(mocks.resolveVanaUserByPrivyEvidence).toHaveBeenCalledWith({
      privySubject: "did:privy:user-token",
      email: "token@example.com",
    });
  });

  it("returns 500 when signing is not configured", async () => {
    const { GET } = await importRoute();
    mocks.resolveVanaCustomAuthJwtConfig.mockImplementation(() => {
      throw new Error("missing key");
    });
    const session = createAccountLoginSessionToken(
      { privySubject: "did:privy:user-1" },
      { secret: "test-session-secret", nowMs: Date.now(), ttlMs: 5000 },
    );

    const response = await GET(
      new Request("https://account.vana.org/api/auth/privy-custom-auth-jwt", {
        headers: {
          cookie: `vana_account_session=${encodeURIComponent(session)}`,
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: { code: "jwt_not_configured" } });
  });
});
