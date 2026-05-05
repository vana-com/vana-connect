// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  findOauthClientById: vi.fn(),
  deleteOauthClient: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/db/oauth-clients", () => ({
  findOauthClientById: mocks.findOauthClientById,
  deleteOauthClient: mocks.deleteOauthClient,
}));

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const OTHER_VANA_USER_ID = "vana_user_" + "f".repeat(32);

function makeSession(vanaUserId = VANA_USER_ID) {
  return {
    vanaUserId,
    hydraSessionId: "hydra_test_sid",
    scope: ["openid", "offline"],
    audience: ["account.vana.org"],
  };
}

function makeClient(ownerVanaUserId: string | null = VANA_USER_ID) {
  return {
    client_id: "memory-app-dev",
    application_id: null,
    display_name: "Memory App (dev)",
    app_url: "https://memory.example",
    owner_address: "0xabc",
    owner_vana_user_id: ownerVanaUserId,
    grantee_address: null,
    builder_id: null,
    public_key: null,
    webhook_url: null,
    redirect_uris: [],
    registered_at: "2026-04-29T11:00:00.000Z",
    updated_at: "2026-04-29T11:00:00.000Z",
  };
}

function makeDeleteRequest(authorized = false): NextRequest {
  return new NextRequest(
    "https://account.vana.org/api/admin/oauth-clients/memory-app-dev",
    {
      method: "DELETE",
      headers: authorized ? { authorization: "Bearer tok" } : {},
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/admin/oauth-clients/[clientId]", () => {
  it("returns 401 when getVanaSession returns null", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(null);
    const route = await import("./route");
    const response = await route.DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ clientId: "memory-app-dev" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.deleteOauthClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findOauthClientById.mockResolvedValueOnce(null);
    const route = await import("./route");
    const response = await route.DELETE(makeDeleteRequest(true), {
      params: Promise.resolve({ clientId: "memory-app-dev" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.deleteOauthClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the client is owned by a different vanaUserId (no info leak)", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findOauthClientById.mockResolvedValueOnce(
      makeClient(OTHER_VANA_USER_ID),
    );
    const route = await import("./route");
    const response = await route.DELETE(makeDeleteRequest(true), {
      params: Promise.resolve({ clientId: "memory-app-dev" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.deleteOauthClient).not.toHaveBeenCalled();
  });

  it("deletes when the session.vanaUserId matches owner_vana_user_id", async () => {
    mocks.getVanaSession.mockResolvedValueOnce(makeSession());
    mocks.findOauthClientById.mockResolvedValueOnce(makeClient(VANA_USER_ID));
    mocks.deleteOauthClient.mockResolvedValueOnce(true);
    const route = await import("./route");
    const response = await route.DELETE(makeDeleteRequest(true), {
      params: Promise.resolve({ clientId: "memory-app-dev" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteOauthClient).toHaveBeenCalledWith("memory-app-dev");
  });
});

describe("GET /api/admin/oauth-clients/[clientId]", () => {
  it("returns 404 when the client does not exist (no auth required)", async () => {
    mocks.findOauthClientById.mockResolvedValueOnce(null);
    const route = await import("./route");
    const response = await route.GET(
      new NextRequest(
        "https://account.vana.org/api/admin/oauth-clients/memory-app-dev",
      ),
      { params: Promise.resolve({ clientId: "memory-app-dev" }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns the client (read is unauthenticated)", async () => {
    mocks.findOauthClientById.mockResolvedValueOnce(makeClient());
    const route = await import("./route");
    const response = await route.GET(
      new NextRequest(
        "https://account.vana.org/api/admin/oauth-clients/memory-app-dev",
      ),
      { params: Promise.resolve({ clientId: "memory-app-dev" }) },
    );
    expect(response.status).toBe(200);
  });
});
