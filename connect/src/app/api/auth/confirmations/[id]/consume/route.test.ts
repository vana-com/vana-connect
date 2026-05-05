// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { InteractiveConfirmationRow } from "@/lib/db/auth-signing";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  consumeConfirmation: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/db/auth-signing", () => ({
  consumeConfirmation: mocks.consumeConfirmation,
}));

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const HYDRA_SID = "hydra_session_abc";
const CONFIRMATION_ID = "vana_confirm_" + "a".repeat(32);

function makeReq(): NextRequest {
  return new Request(
    `https://account.vana.org/api/auth/confirmations/${CONFIRMATION_ID}/consume`,
    {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    },
  ) as unknown as NextRequest;
}

function makeParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: CONFIRMATION_ID }) };
}

function makeSession() {
  return {
    vanaUserId: VANA_USER_ID,
    hydraSessionId: HYDRA_SID,
    scope: ["openid", "offline"],
    audience: ["account.vana.org"],
  };
}

function makeRow(): InteractiveConfirmationRow {
  return {
    id: CONFIRMATION_ID,
    vana_user_id: VANA_USER_ID,
    hydra_session_id: HYDRA_SID,
    vana_wallet_id: "vana_wallet_" + "1".repeat(32),
    purpose: "register_personal_server",
    payload_hash: "0x" + "a".repeat(64),
    payload_summary: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/confirmations/:id/consume", () => {
  it("returns 401 when getVanaSession returns null", async () => {
    mocks.getVanaSession.mockResolvedValue(null);
    const { POST } = await import("./route");

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.consumeConfirmation).not.toHaveBeenCalled();
  });

  it("returns 200 ok:true when consumeConfirmation returns a row", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.consumeConfirmation.mockResolvedValue(makeRow());
    const { POST } = await import("./route");

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns 409 already_consumed_or_expired when consumeConfirmation returns null", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.consumeConfirmation.mockResolvedValue(null);
    const { POST } = await import("./route");

    const res = await POST(makeReq(), makeParams());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "already_consumed_or_expired",
    });
  });

  it("calls consumeConfirmation with the id, vanaUserId, and hydraSessionId from the session", async () => {
    mocks.getVanaSession.mockResolvedValue(makeSession());
    mocks.consumeConfirmation.mockResolvedValue(makeRow());
    const { POST } = await import("./route");

    await POST(makeReq(), makeParams());

    expect(mocks.consumeConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.consumeConfirmation).toHaveBeenCalledWith({
      id: CONFIRMATION_ID,
      vanaUserId: VANA_USER_ID,
      hydraSessionId: HYDRA_SID,
    });
  });
});
