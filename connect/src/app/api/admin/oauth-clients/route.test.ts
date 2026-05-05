// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  findOauthClientsByOwnerVanaUserId: vi.fn(),
  upsertOauthClient: vi.fn(),
  findLinkedWalletsByUser: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/db/oauth-clients", () => ({
  findOauthClientsByOwnerVanaUserId: mocks.findOauthClientsByOwnerVanaUserId,
  upsertOauthClient: mocks.upsertOauthClient,
}));

vi.mock("@/lib/db/account", () => ({
  findLinkedWalletsByUser: mocks.findLinkedWalletsByUser,
}));

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const PRIMARY_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function makeSession() {
  return {
    vanaUserId: VANA_USER_ID,
    hydraSessionId: "hydra_test_sid",
    scope: ["openid", "offline"],
    audience: ["account.vana.org"],
  };
}

function makePrimaryWallet() {
  return {
    id: "vana_wallet_1",
    vana_user_id: VANA_USER_ID,
    provider: "privy",
    provider_wallet_id: "wallet-1",
    chain_type: "evm",
    address: PRIMARY_ADDRESS,
    is_primary: true,
    verified_at: "2026-04-29T11:00:00.000Z",
    created_at: "2026-04-29T11:00:00.000Z",
  };
}

function makeGetRequest(authorized = false): NextRequest {
  return new NextRequest("https://account.vana.org/api/admin/oauth-clients", {
    headers: authorized ? { authorization: "Bearer tok" } : {},
  });
}

function makePostRequest(body: unknown, authorized = false): NextRequest {
  return new NextRequest("https://account.vana.org/api/admin/oauth-clients", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { authorization: "Bearer tok" } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/oauth-clients", () => {
  it("returns 401 when getVanaSession returns null", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(null);
    const route = await import("./route");
    const response = await route.GET(makeGetRequest());
    expect(response.status).toBe(401);
    expect(mocks.findOauthClientsByOwnerVanaUserId).not.toHaveBeenCalled();
  });

  it("lists clients owned by the session.vanaUserId", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findOauthClientsByOwnerVanaUserId.mockResolvedValueOnce([
      {
        client_id: "memory-app-dev",
        display_name: "Memory App (dev)",
        owner_vana_user_id: VANA_USER_ID,
        owner_address: PRIMARY_ADDRESS,
      },
    ]);
    const route = await import("./route");
    const response = await route.GET(makeGetRequest(true));
    expect(response.status).toBe(200);
    expect(mocks.findOauthClientsByOwnerVanaUserId).toHaveBeenCalledWith(
      VANA_USER_ID,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.object).toBe("list");
  });
});

describe("POST /api/admin/oauth-clients", () => {
  it("returns 401 when getVanaSession returns null", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(null);
    const route = await import("./route");
    const response = await route.POST(
      makePostRequest({
        clientId: "test",
        displayName: "Test",
        appUrl: "https://test.example",
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.upsertOauthClient).not.toHaveBeenCalled();
  });

  it("populates owner_vana_user_id from the session and owner_address from the primary wallet", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findLinkedWalletsByUser.mockResolvedValueOnce([makePrimaryWallet()]);
    mocks.upsertOauthClient.mockImplementationOnce(async (input: unknown) => ({
      ...((input as Record<string, unknown>) ?? {}),
      registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const route = await import("./route");
    const response = await route.POST(
      makePostRequest(
        {
          clientId: "memory-app-dev",
          displayName: "Memory App (dev)",
          appUrl: "https://memory.example",
          redirectUris: ["https://memory.example/cb"],
        },
        true,
      ),
    );

    expect(response.status).toBe(201);
    expect(mocks.upsertOauthClient).toHaveBeenCalledTimes(1);
    const insertedInput = mocks.upsertOauthClient.mock.calls[0][0] as {
      ownerVanaUserId: string;
      ownerAddress: string;
      clientId: string;
    };
    expect(insertedInput.ownerVanaUserId).toBe(VANA_USER_ID);
    expect(insertedInput.ownerAddress).toBe(PRIMARY_ADDRESS.toLowerCase());
    expect(insertedInput.clientId).toBe("memory-app-dev");
  });

  it("rejects when the caller has no linked wallet", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findLinkedWalletsByUser.mockResolvedValueOnce([]);

    const route = await import("./route");
    const response = await route.POST(
      makePostRequest(
        {
          clientId: "memory-app-dev",
          displayName: "Memory App (dev)",
          appUrl: "https://memory.example",
        },
        true,
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsertOauthClient).not.toHaveBeenCalled();
  });
});
