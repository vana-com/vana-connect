// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { InteractiveConfirmationRow } from "@/lib/db/auth-signing";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  findConfirmationById: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/db/auth-signing", () => ({
  findConfirmationById: mocks.findConfirmationById,
}));

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const HYDRA_SID = "hydra_session_abc";
const CONFIRMATION_ID = "vana_confirm_" + "a".repeat(32);

function makeReq(): NextRequest {
  return new Request(
    `https://account.vana.org/api/auth/confirmations/${CONFIRMATION_ID}/status`,
    {
      method: "GET",
      headers: { authorization: "Bearer tok" },
    },
  ) as unknown as NextRequest;
}

function makeParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: CONFIRMATION_ID }) };
}

function makeSession(overrides: Partial<{ vanaUserId: string }> = {}) {
  return {
    vanaUserId: VANA_USER_ID,
    hydraSessionId: HYDRA_SID,
    scope: ["openid", "offline"],
    audience: ["account.vana.org"],
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<InteractiveConfirmationRow> = {},
): InteractiveConfirmationRow {
  return {
    id: CONFIRMATION_ID,
    vana_user_id: VANA_USER_ID,
    hydra_session_id: HYDRA_SID,
    vana_wallet_id: "vana_wallet_" + "1".repeat(32),
    purpose: "register_personal_server",
    payload_hash: "0x" + "a".repeat(64),
    payload_summary: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/confirmations/:id/status", () => {
  it("returns 401 when getVanaSession returns null", async () => {
    mocks.getVanaSession.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.findConfirmationById).not.toHaveBeenCalled();
  });

  it("returns 404 when findConfirmationById returns null", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.findConfirmationById.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns 404 when row.vana_user_id does not match the session", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.findConfirmationById.mockResolvedValue(
      makeRow({ vana_user_id: "vana_user_" + "9".repeat(32) }),
    );
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns 200 status=pending when consumed_at is null and expires_at is in the future", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    mocks.findConfirmationById.mockResolvedValue(
      makeRow({ consumed_at: null, expires_at: expiresAt }),
    );
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "pending",
      expires_at: expiresAt,
    });
  });

  it("returns 200 status=confirmed when consumed_at is non-null", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.findConfirmationById.mockResolvedValue(
      makeRow({ consumed_at: new Date().toISOString() }),
    );
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "confirmed" });
  });

  it("returns 200 status=expired when expires_at is past and consumed_at is null", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.findConfirmationById.mockResolvedValue(
      makeRow({
        consumed_at: null,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const { GET } = await import("./route");

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "expired" });
  });
});
