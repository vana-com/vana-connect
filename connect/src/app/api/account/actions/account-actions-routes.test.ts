import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActionRequestRow,
  hashActionCode,
} from "@/lib/auth/account-action";

/**
 * App Router-level integration tests for `/api/account/actions/*`.
 *
 * The DB module and Privy SDK are stubbed via `vi.mock` so these tests run
 * without `DATABASE_URL` or live Privy. The pure handlers in
 * `lib/auth/account-action-routes.ts` already cover branch-level logic; this
 * suite verifies the route wiring (JSON in, JSON out, status codes) does not
 * regress.
 */

const mocks = vi.hoisted(() => ({
  insertActionRequest: vi.fn(),
  consumeActionCodeWithExchangeEvent: vi.fn(),
  findActionRequestById: vi.fn(),
  insertConsentEvent: vi.fn(),
  persistActionDecisionBundle: vi.fn(),
  resolveVanaUserByPrivyEvidence: vi.fn(),
  privyUsersGet: vi.fn(),
}));

vi.mock("@/lib/db/account-actions", () => ({
  insertActionRequest: mocks.insertActionRequest,
  consumeActionCodeWithExchangeEvent: mocks.consumeActionCodeWithExchangeEvent,
  findActionRequestById: mocks.findActionRequestById,
  insertConsentEvent: mocks.insertConsentEvent,
  persistActionDecisionBundle: mocks.persistActionDecisionBundle,
}));

vi.mock("@/lib/db/account", () => ({
  resolveVanaUserByPrivyEvidence: mocks.resolveVanaUserByPrivyEvidence,
}));

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    users() {
      return { get: mocks.privyUsersGet };
    }
  },
}));

const REGISTERED_CLIENT = "memory-app-dev";
const REGISTERED_REDIRECT = "http://localhost:3000/api/auth/callback/vana";
const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";

async function importRoutes() {
  return {
    create: await import("./route"),
    get: await import("./[id]/route"),
    exchange: await import("./exchange/route"),
    decision: await import("./[id]/decision/route"),
  };
}

function makePostRequest(
  url: string,
  body: unknown,
  headers: HeadersInit = {},
) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRIVY_APP_ID = "test-privy-app";
  process.env.PRIVY_APP_SECRET = "test-privy-secret";
});

describe("POST /api/account/actions", () => {
  it("rejects unknown client_id with a 400 invalid-client error", async () => {
    const { create } = await importRoutes();
    const response = await create.POST(
      makePostRequest("https://account.vana.org/api/account/actions", {
        client_id: "unregistered",
        redirect_uri: REGISTERED_REDIRECT,
        action_type: "mock.echo",
        execution_mode: "mock",
        result_mode: "mock",
        requested_data: { connector: "mock" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect((body.error as Record<string, unknown>).code).toBe("unknown_client");
    expect(mocks.insertActionRequest).not.toHaveBeenCalled();
  });

  it("rejects unregistered redirect_uri", async () => {
    const { create } = await importRoutes();
    const response = await create.POST(
      makePostRequest("https://account.vana.org/api/account/actions", {
        client_id: REGISTERED_CLIENT,
        redirect_uri: "http://localhost:3000/evil",
        action_type: "mock.echo",
        requested_data: { connector: "mock" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect((body.error as Record<string, unknown>).code).toBe(
      "unregistered_redirect_uri",
    );
  });

  it("rejects non-mock execution_mode", async () => {
    const { create } = await importRoutes();
    const response = await create.POST(
      makePostRequest("https://account.vana.org/api/account/actions", {
        client_id: REGISTERED_CLIENT,
        redirect_uri: REGISTERED_REDIRECT,
        action_type: "mock.echo",
        execution_mode: "byo_wallet_client_signed",
        result_mode: "mock",
        requested_data: { connector: "mock" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect((body.error as Record<string, unknown>).code).toBe(
      "unsupported_execution_mode",
    );
  });

  it("creates a request and returns the documented response shape", async () => {
    mocks.insertActionRequest.mockImplementationOnce(
      async (row: unknown) => row,
    );
    mocks.insertConsentEvent.mockImplementationOnce(
      async (row: unknown) => row,
    );
    const { create } = await importRoutes();
    const response = await create.POST(
      makePostRequest("https://account.vana.org/api/account/actions", {
        client_id: REGISTERED_CLIENT,
        redirect_uri: REGISTERED_REDIRECT,
        action_type: "mock.echo",
        requested_data: { connector: "mock" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.action_request_id).toMatch(/^vana_areq_[a-f0-9]{32}$/);
    expect(body.action_url).toMatch(/account\/actions\/vana_areq_/);
    expect(body.execution_mode).toBe("mock");
    expect(body.result_mode).toBe("mock");
    expect(typeof body.expires_at).toBe("string");
    // Make sure raw user data never appears anywhere in the response.
    expect(JSON.stringify(body)).not.toContain("PII");
  });
});

describe("POST /api/account/actions/exchange", () => {
  it("returns invalid_grant for unknown client", async () => {
    const { exchange } = await importRoutes();
    const response = await exchange.POST(
      makePostRequest("https://account.vana.org/api/account/actions/exchange", {
        client_id: "unregistered",
        action_code: "vana_ac_x",
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect((body.error as Record<string, unknown>).code).toBe("invalid_grant");
  });

  it("returns the mock result on a successful exchange and never leaks the hash", async () => {
    const code = "vana_ac_success";
    const requestRow = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: VANA_USER_ID,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock" },
      redirectUri: REGISTERED_REDIRECT,
      now: new Date(),
    }).row;
    const consumed = {
      ok: true as const,
      result: {
        id: "vana_ares_test",
        action_request_id: requestRow.id,
        client_id: REGISTERED_CLIENT,
        action_code_hash: hashActionCode(code),
        result_mode: "mock" as const,
        result_payload: { mock: true, action_type: "mock.echo" },
        result_reference: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: new Date().toISOString(),
      },
    };
    mocks.consumeActionCodeWithExchangeEvent.mockResolvedValueOnce(consumed);

    const { exchange } = await importRoutes();
    const response = await exchange.POST(
      makePostRequest("https://account.vana.org/api/account/actions/exchange", {
        client_id: REGISTERED_CLIENT,
        action_code: code,
      }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.result_mode).toBe("mock");
    expect(body.result_payload).toEqual({
      mock: true,
      action_type: "mock.echo",
    });
    expect(body.action_request_id).toBe(requestRow.id);
    // Never expose the persisted action_code_hash to the OAuth client.
    expect(JSON.stringify(body)).not.toContain(
      consumed.result.action_code_hash,
    );
  });

  it("maps consumed reason to invalid_grant", async () => {
    mocks.consumeActionCodeWithExchangeEvent.mockResolvedValueOnce({
      ok: false,
      reason: "consumed",
    });
    const { exchange } = await importRoutes();
    const response = await exchange.POST(
      makePostRequest("https://account.vana.org/api/account/actions/exchange", {
        client_id: REGISTERED_CLIENT,
        action_code: "vana_ac_replay",
      }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect((body.error as Record<string, unknown>).code).toBe("invalid_grant");
  });
});

describe("GET /api/account/actions/[id]", () => {
  it("returns 401 without login evidence", async () => {
    const { get } = await importRoutes();
    const response = await get.GET(
      new NextRequest("https://account.vana.org/api/account/actions/x"),
      { params: Promise.resolve({ id: "vana_areq_x" }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns display-safe request details for the logged-in user", async () => {
    mocks.privyUsersGet.mockResolvedValueOnce({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValueOnce({
      user: { id: VANA_USER_ID },
      created: false,
    });
    const action = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: null,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock", scopes: ["read"] },
      redirectUri: REGISTERED_REDIRECT,
      state: "secret-state",
      displayMetadata: { title: "Read memory data" },
      now: new Date(),
    }).row;
    mocks.findActionRequestById.mockResolvedValueOnce(action);

    const { get } = await importRoutes();
    const response = await get.GET(
      new NextRequest(
        `https://account.vana.org/api/account/actions/${action.id}`,
        { headers: { authorization: "Bearer privy-token-stub" } },
      ),
      { params: Promise.resolve({ id: action.id }) },
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.client).toEqual({
      client_id: REGISTERED_CLIENT,
      display_name: "Memory App (dev)",
    });
    expect(body.requested_data).toEqual({
      connector: "mock",
      scopes: ["read"],
    });
    expect(JSON.stringify(body)).not.toContain("secret-state");
    expect(JSON.stringify(body)).not.toContain("state_hash");
    expect(JSON.stringify(body)).not.toContain(REGISTERED_REDIRECT);
  });
});

describe("POST /api/account/actions/[id]/decision", () => {
  function makeDecisionRequest(id: string, body: unknown, withAuth = true) {
    return makePostRequest(
      `https://account.vana.org/api/account/actions/${id}/decision`,
      body,
      withAuth ? { authorization: "Bearer privy-token-stub" } : {},
    );
  }

  it("returns 401 without login evidence", async () => {
    const { decision } = await importRoutes();
    const response = await decision.POST(
      makeDecisionRequest("vana_areq_x", { decision: "approved" }, false),
      { params: Promise.resolve({ id: "vana_areq_x" }) },
    );
    expect(response.status).toBe(401);
  });

  it("approves a pending request and returns a redirect_url with action_code only", async () => {
    mocks.privyUsersGet.mockResolvedValueOnce({
      id: "did:privy:user-1",
      linked_accounts: [],
    });
    mocks.resolveVanaUserByPrivyEvidence.mockResolvedValueOnce({
      user: { id: VANA_USER_ID },
      created: false,
    });

    const pending = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: null,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock" },
      redirectUri: REGISTERED_REDIRECT,
      now: new Date(),
    }).row;
    mocks.findActionRequestById.mockResolvedValueOnce(pending);
    mocks.persistActionDecisionBundle.mockImplementationOnce(
      async ({ result, event }: { result: unknown; event: unknown }) => ({
        request: {
          ...pending,
          status: "approved",
          vana_user_id: VANA_USER_ID,
          decided_at: new Date().toISOString(),
        },
        result,
        event,
      }),
    );

    const { decision } = await importRoutes();
    const response = await decision.POST(
      makeDecisionRequest(pending.id, { decision: "approved" }),
      { params: Promise.resolve({ id: pending.id }) },
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.decision).toBe("approved");
    const redirect = new URL(body.redirect_url as string);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REGISTERED_REDIRECT);
    expect([...redirect.searchParams.keys()]).toEqual(["action_code"]);
    expect(JSON.stringify(body)).not.toMatch(/PII|secret/);
  });
});
