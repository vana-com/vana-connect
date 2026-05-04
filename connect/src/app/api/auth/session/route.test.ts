import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_LOGIN_SESSION_COOKIE,
  verifyAccountLoginSessionToken,
} from "@/lib/auth/account-login-session";

const mocks = vi.hoisted(() => ({
  privyUsersGet: vi.fn(),
}));

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    users() {
      return { get: mocks.privyUsersGet };
    }
  },
}));

async function importRoute() {
  return await import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRIVY_APP_ID = "test-privy-app";
  process.env.PRIVY_APP_SECRET = "test-privy-secret";
  delete process.env.ACCOUNT_LOGIN_SESSION_SECRET;
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

  it("verifies the Privy identity token and sets a Vana-owned session cookie", async () => {
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
          id: "wallet-1",
        },
      ],
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

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ACCOUNT_LOGIN_SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const cookieValue = /vana_account_session=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieValue).toBeTruthy();
    expect(
      verifyAccountLoginSessionToken(decodeURIComponent(cookieValue ?? ""), {
        secret: "test-privy-secret",
      }),
    ).toEqual({
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xabc",
        providerWalletId: "wallet-1",
      },
    });
  });
});

describe("DELETE /api/auth/session", () => {
  it("clears the Vana-owned session cookie", async () => {
    const { DELETE } = await importRoute();

    const response = await DELETE();

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ACCOUNT_LOGIN_SESSION_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
  });
});
