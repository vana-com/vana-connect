import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActionRequestRow,
  ActionResultRow,
  ConsentEventRow,
} from "@/lib/auth/account-action";
import { createAccountLoginSessionToken } from "@/lib/auth/account-login-session";

const mocks = vi.hoisted(() => ({
  resolveVanaUserByPrivyEvidence: vi.fn(),
  findProviderLinksByUser: vi.fn(),
  findLinkedWalletsByUser: vi.fn(),
  listActionRequestsByUser: vi.fn(),
  listActionResultsForRequests: vi.fn(),
  listConsentEventsByUser: vi.fn(),
  revokeActionRequest: vi.fn(),
  revokeActionRequestsForClient: vi.fn(),
}));

vi.mock("@/lib/db/account", () => ({
  resolveVanaUserByPrivyEvidence: mocks.resolveVanaUserByPrivyEvidence,
  findProviderLinksByUser: mocks.findProviderLinksByUser,
  findLinkedWalletsByUser: mocks.findLinkedWalletsByUser,
}));

vi.mock("@/lib/db/account-actions", () => ({
  listActionRequestsByUser: mocks.listActionRequestsByUser,
  listActionResultsForRequests: mocks.listActionResultsForRequests,
  listConsentEventsByUser: mocks.listConsentEventsByUser,
  revokeActionRequest: mocks.revokeActionRequest,
  revokeActionRequestsForClient: mocks.revokeActionRequestsForClient,
}));

function makeRequest(cookie?: string) {
  return new NextRequest("https://account.vana.org/api/account/access", {
    headers: cookie ? { cookie } : {},
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function accountCookie() {
  const token = createAccountLoginSessionToken(
    {
      privySubject: "did:privy:user-1",
      email: "tim@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xabc",
        providerWalletId: "wallet-1",
      },
    },
    { secret: "test-secret", nowMs: Date.now(), ttlMs: 60_000 },
  );
  return `vana_account_session=${token}`;
}

const actionRequest: ActionRequestRow = {
  id: "vana_areq_1",
  client_id: "memory-app-dev",
  vana_user_id: "vana_user_1",
  action_type: "data.read.chatgpt",
  execution_mode: "mock",
  result_mode: "mock",
  requested_data: {
    connector: "chatgpt-playwright",
    scopes: ["chatgpt.memories", "chatgpt.conversations"],
    purposeCode: "memory-app.chatgpt-import",
    purposeDescription:
      "Let Memory App build memory from your ChatGPT memories and conversation history.",
    accessMode: "read_until_revoked",
  },
  redirect_uri: "http://localhost:3084/dev/login-with-vana",
  state_hash: null,
  status: "approved",
  display_metadata: null,
  created_at: "2026-04-29T12:00:00.000Z",
  expires_at: "2026-04-29T12:10:00.000Z",
  decided_at: "2026-04-29T12:01:00.000Z",
};

const actionResult: ActionResultRow = {
  id: "vana_ares_1",
  action_request_id: "vana_areq_1",
  client_id: "memory-app-dev",
  action_code_hash: "hash",
  result_mode: "mock",
  result_payload: { mock: true },
  result_reference: null,
  created_at: "2026-04-29T12:01:00.000Z",
  expires_at: "2026-04-29T12:03:00.000Z",
  consumed_at: null,
};

const consentEvent: ConsentEventRow = {
  id: "vana_evt_1",
  schema_version: 1,
  event_type: "action.approved",
  occurred_at: "2026-04-29T12:01:00.000Z",
  issuer: "account.vana.org",
  vana_user_id: "vana_user_1",
  subject_wallet_address: null,
  client_id: "memory-app-dev",
  application_id: null,
  protocol_principal: null,
  action_request_id: "vana_areq_1",
  action_type: "data.read.chatgpt",
  requested_data: actionRequest.requested_data,
  decision: "approved",
  execution_mode: "mock",
  result_mode: "mock",
  authorization_reference: null,
  idempotency_key: "idem",
  request_hash: "request-hash",
  audit_metadata: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ACCOUNT_LOGIN_SESSION_SECRET = "test-secret";
});

describe("GET /api/account/access", () => {
  it("returns 401 without a Vana account session cookie", async () => {
    const route = await import("./route");
    const response = await route.GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.resolveVanaUserByPrivyEvidence).not.toHaveBeenCalled();
  });

  it("returns real account summary from canonical session state", async () => {
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValueOnce({
      user: {
        id: "vana_user_1",
        display_name: "Tim",
        created_at: "2026-04-29T11:00:00.000Z",
        updated_at: "2026-04-29T11:00:00.000Z",
      },
    });
    mocks.findProviderLinksByUser.mockResolvedValueOnce([
      {
        id: "vana_plink_1",
        vana_user_id: "vana_user_1",
        provider: "privy",
        provider_subject: "did:privy:user-1",
        email: "tim@example.com",
        metadata: {},
        created_at: "2026-04-29T11:00:00.000Z",
      },
    ]);
    mocks.findLinkedWalletsByUser.mockResolvedValueOnce([
      {
        id: "vana_wallet_1",
        vana_user_id: "vana_user_1",
        provider: "privy",
        provider_wallet_id: "wallet-1",
        chain_type: "evm",
        address: "0xabc",
        is_primary: true,
        verified_at: "2026-04-29T11:00:00.000Z",
        created_at: "2026-04-29T11:00:00.000Z",
      },
    ]);
    mocks.listActionRequestsByUser.mockResolvedValueOnce([actionRequest]);
    mocks.listActionResultsForRequests.mockResolvedValueOnce([actionResult]);
    mocks.listConsentEventsByUser.mockResolvedValueOnce([consentEvent]);

    const route = await import("./route");
    const response = await route.GET(makeRequest(accountCookie()));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.account).toMatchObject({ vana_user_id: "vana_user_1" });
    expect(body.provider_links).toHaveLength(1);
    expect(body.linked_wallets).toHaveLength(1);
    expect(body.connected_apps).toMatchObject([
      { client_id: "memory-app-dev", display_name: "Memory App (dev)" },
    ]);
    expect(body.access_requests).toMatchObject([
      {
        requested_data_summary:
          "ChatGPT: memories and conversation history. Let Memory App build memory from your ChatGPT memories and conversation history. Access: Until you revoke access.",
        requested_data_display: {
          data_source: "ChatGPT",
          data_types: "memories and conversation history",
          purpose:
            "Let Memory App build memory from your ChatGPT memories and conversation history.",
          access_duration: "Until you revoke access",
        },
        action_label: "Read ChatGPT data",
        revoke_note:
          "RPC revocation is mocked; local grant state will be revoked.",
        can_revoke: true,
      },
    ]);
    expect(body.activity).toMatchObject([
      { event_type: "action.approved", decision: "approved" },
    ]);
  });
});

describe("POST /api/account/access/grants/[id]/revoke", () => {
  it("rejects unauthenticated revoke", async () => {
    const route = await import("./grants/[id]/revoke/route");
    const response = await route.POST(makeRequest(), {
      params: Promise.resolve({ id: "vana_areq_1" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.revokeActionRequest).not.toHaveBeenCalled();
  });

  it("returns 409 for inactive grant revocation", async () => {
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValueOnce({
      user: {
        id: "vana_user_1",
        display_name: "Tim",
        created_at: "2026-04-29T11:00:00.000Z",
        updated_at: "2026-04-29T11:00:00.000Z",
      },
    });
    mocks.revokeActionRequest.mockResolvedValueOnce({
      status: "not_active",
      request: { ...actionRequest, status: "revoked" },
    });

    const route = await import("./grants/[id]/revoke/route");
    const response = await route.POST(makeRequest(accountCookie()), {
      params: Promise.resolve({ id: "vana_areq_1" }),
    });

    expect(response.status).toBe(409);
  });
});

describe("POST /api/account/access/apps/[clientId]/disconnect", () => {
  it("rejects unauthenticated disconnect", async () => {
    const route = await import("./apps/[clientId]/disconnect/route");
    const response = await route.POST(makeRequest(), {
      params: Promise.resolve({ clientId: "memory-app-dev" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.revokeActionRequestsForClient).not.toHaveBeenCalled();
  });
});
