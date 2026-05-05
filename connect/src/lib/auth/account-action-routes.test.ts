import { describe, expect, it, vi } from "vitest";
import {
  type ActionRequestRow,
  type ActionResultRow,
  buildMockActionResult,
  type ConsentEventRow,
  createActionRequestRow,
  hashActionCode,
} from "./account-action";
import {
  handleActionDecision,
  handleCreateActionRequest,
  handleExchangeActionCode,
  handleGetActionRequest,
} from "./account-action-routes";

const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";
const OTHER_VANA_USER_ID = "vana_user_aaaabbbbccccddddeeeefffff0000111";

const REGISTERED_REDIRECT = "http://localhost:3000/api/auth/callback/vana";
const REGISTERED_CLIENT = "memory-app-dev";

function fakeResolveVanaUserId(
  vanaUserId: string | null,
): (request: Request) => Promise<string | null> {
  return vi.fn().mockResolvedValue(vanaUserId);
}

function buildBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    client_id: REGISTERED_CLIENT,
    redirect_uri: REGISTERED_REDIRECT,
    action_type: "mock.echo",
    execution_mode: "mock",
    result_mode: "mock",
    requested_data: { connector: "mock", scopes: ["read"] },
    ...overrides,
  };
}

function makeCreateDeps() {
  return {
    insertActionRequest: vi.fn(async (row: ActionRequestRow) => row),
    insertConsentEvent: vi.fn(async (row: ConsentEventRow) => row),
  };
}

describe("handleCreateActionRequest", () => {
  it("rejects unknown client_id", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ client_id: "unregistered-client" }),
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("unknown_client");
    expect(deps.insertActionRequest).not.toHaveBeenCalled();
    expect(deps.insertConsentEvent).not.toHaveBeenCalled();
  });

  it("rejects unregistered redirect_uri", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ redirect_uri: "http://localhost:3000/evil" }),
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("unregistered_redirect_uri");
    expect(deps.insertActionRequest).not.toHaveBeenCalled();
  });

  it("rejects malformed redirect_uri", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ redirect_uri: "//evil.example.com/cb" }),
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("malformed_redirect_uri");
  });

  it("rejects non-mock execution_mode in the first slice", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ execution_mode: "byo_wallet_client_signed" }),
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("unsupported_execution_mode");
    expect(deps.insertActionRequest).not.toHaveBeenCalled();
  });

  it("rejects non-mock result_mode in the first slice", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ result_mode: "encrypted_bundle_reference" }),
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("unsupported_result_mode");
  });

  it("rejects missing action_type", async () => {
    const deps = makeCreateDeps();
    const body = buildBody();
    delete (body as Record<string, unknown>).action_type;
    const result = await handleCreateActionRequest({
      body,
      ...deps,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("invalid_request");
  });

  it("creates a request, persists action.requested, and returns id, action_url with state, expires_at", async () => {
    const deps = makeCreateDeps();
    const now = new Date("2026-04-28T12:00:00.000Z");
    const result = await handleCreateActionRequest({
      body: buildBody({ state: "client-state-xyz" }),
      ...deps,
      now,
      baseUrl: "https://account.vana.org",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.action_request_id).toMatch(/^vana_areq_[a-f0-9]{32}$/);
    expect(result.body.action_url).toBe(
      `https://account.vana.org/account/actions/${result.body.action_request_id}?state=client-state-xyz`,
    );
    expect(result.body.expires_at).toBe("2026-04-28T12:10:00.000Z");
    expect(result.body.execution_mode).toBe("mock");
    expect(result.body.result_mode).toBe("mock");

    expect(deps.insertActionRequest).toHaveBeenCalledOnce();
    const persistedRow = deps.insertActionRequest.mock.calls[0][0];
    expect(persistedRow.state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedRow.vana_user_id).toBeNull();
    expect(persistedRow.status).toBe("pending");
    // Critical: raw state is NEVER stored on the row.
    expect(JSON.stringify(persistedRow)).not.toContain("client-state-xyz");

    expect(deps.insertConsentEvent).toHaveBeenCalledOnce();
    const consentRow = deps.insertConsentEvent.mock.calls[0][0];
    expect(consentRow.event_type).toBe("action.requested");
    expect(consentRow.idempotency_key).toBe(`${persistedRow.id}:requested`);
    expect(consentRow.request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(consentRow.vana_user_id).toBeNull();
  });

  it("omits state from action_url when state is not provided", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody(),
      ...deps,
      baseUrl: "https://account.vana.org",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.action_url).not.toContain("state=");
    expect(result.body.action_url).toBe(
      `https://account.vana.org/account/actions/${result.body.action_request_id}`,
    );
  });

  it("never reflects raw state into the response body except in action_url", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({ state: "very-secret-state" }),
      ...deps,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // action_url legitimately carries state via query string (browser-only).
    expect(result.body.action_url).toContain("state=very-secret-state");
    // No other body field should leak the state.
    const otherFields = { ...result.body, action_url: "" };
    const serialized = JSON.stringify(otherFields);
    expect(serialized).not.toContain("very-secret-state");
  });

  it("does not include user data fields in action_url", async () => {
    const deps = makeCreateDeps();
    const result = await handleCreateActionRequest({
      body: buildBody({
        state: "s",
        requested_data: { connector: "mock", scopes: ["read:secret-data"] },
      }),
      ...deps,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.action_url).not.toContain("secret-data");
    expect(result.body.action_url).not.toContain("requested_data");
  });
});

describe("handleGetActionRequest", () => {
  function buildRequest(
    overrides: Partial<ActionRequestRow> = {},
  ): ActionRequestRow {
    const { row } = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: null,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock", scopes: ["read"] },
      redirectUri: REGISTERED_REDIRECT,
      displayMetadata: { title: "Read memory data" },
      now: new Date("2026-04-29T12:00:00.000Z"),
    });
    return { ...row, ...overrides };
  }

  function makeInput(
    overrides: Partial<Parameters<typeof handleGetActionRequest>[0]> = {},
  ) {
    const action = buildRequest();
    return {
      request: new Request(
        `https://account.vana.org/api/account/actions/${action.id}`,
      ),
      actionRequestId: action.id,
      resolveVanaUserId: fakeResolveVanaUserId(VANA_USER_ID),
      findActionRequestById: vi.fn().mockResolvedValue(action),
      ...overrides,
    } as Parameters<typeof handleGetActionRequest>[0];
  }

  it("requires login evidence", async () => {
    const input = makeInput({ resolveVanaUserId: fakeResolveVanaUserId(null) });
    const result = await handleGetActionRequest(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(401);
    expect(result.code).toBe("login_required");
  });

  it("returns display-safe action details for the current user", async () => {
    const action = buildRequest({ state_hash: "a".repeat(64) });
    const input = makeInput({
      actionRequestId: action.id,
      findActionRequestById: vi.fn().mockResolvedValue(action),
    });
    const result = await handleGetActionRequest(input);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.client.display_name).toBe("Memory App (dev)");
    expect(result.body.action_type).toBe("mock.echo");
    expect(result.body.requested_data).toEqual({
      connector: "mock",
      scopes: ["read"],
    });
    expect(result.body.display_metadata).toEqual({
      title: "Read memory data",
    });
    expect(JSON.stringify(result.body)).not.toContain("state_hash");
    expect(JSON.stringify(result.body)).not.toContain(VANA_USER_ID);
  });

  it("forbids viewing an action already bound to another Vana user", async () => {
    const input = makeInput({
      findActionRequestById: vi
        .fn()
        .mockResolvedValue(buildRequest({ vana_user_id: OTHER_VANA_USER_ID })),
    });
    const result = await handleGetActionRequest(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });
});

describe("handleExchangeActionCode", () => {
  function makeResult(
    overrides: Partial<ActionResultRow> = {},
  ): ActionResultRow {
    const now = new Date();
    const { row: requestRow } = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: VANA_USER_ID,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock" },
      redirectUri: REGISTERED_REDIRECT,
      now,
    });
    const approved: ActionRequestRow = { ...requestRow, status: "approved" };
    return {
      ...buildMockActionResult({
        request: approved,
        actionCode: "vana_ac_test",
        now,
      }),
      ...overrides,
    };
  }

  it("rejects unknown client_id with stable invalid_grant", async () => {
    const consumeActionCodeWithExchangeEvent = vi.fn();
    const result = await handleExchangeActionCode({
      body: { client_id: "unregistered", action_code: "vana_ac_xxx" },
      consumeActionCodeWithExchangeEvent,
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("invalid_grant");
    expect(consumeActionCodeWithExchangeEvent).not.toHaveBeenCalled();
  });

  it("rejects missing action_code", async () => {
    const result = await handleExchangeActionCode({
      body: { client_id: REGISTERED_CLIENT },
      consumeActionCodeWithExchangeEvent: vi.fn(),
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("invalid_request");
  });

  it("returns mock result on success and never leaks the action code hash", async () => {
    const persisted = makeResult();
    const consumeActionCodeWithExchangeEvent = vi.fn().mockResolvedValue({
      ok: true,
      result: persisted,
    });
    const result = await handleExchangeActionCode({
      body: { client_id: REGISTERED_CLIENT, action_code: "vana_ac_ok" },
      consumeActionCodeWithExchangeEvent,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.result_mode).toBe("mock");
    expect(result.body.result_payload).toEqual({
      mock: true,
      action_type: "mock.echo",
    });
    expect(result.body.action_request_id).toBe(persisted.action_request_id);
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain(persisted.action_code_hash);
  });

  it("delegates exchange consumption and action.exchanged persistence to one effect", async () => {
    const persisted = makeResult();
    const consumeActionCodeWithExchangeEvent = vi.fn().mockResolvedValue({
      ok: true,
      result: persisted,
    });
    const now = new Date("2026-04-29T12:00:00.000Z");
    const result = await handleExchangeActionCode({
      body: { client_id: REGISTERED_CLIENT, action_code: "vana_ac_ok" },
      consumeActionCodeWithExchangeEvent,
      now,
      issuer: "https://account.vana.org",
    });
    expect(result.kind).toBe("ok");
    expect(consumeActionCodeWithExchangeEvent).toHaveBeenCalledWith({
      presentedCode: "vana_ac_ok",
      presentingClientId: REGISTERED_CLIENT,
      issuer: "https://account.vana.org",
      now,
    });
  });

  it("maps consume failures to stable OAuth-ish errors", async () => {
    for (const reason of [
      "not_found",
      "client_mismatch",
      "consumed",
    ] as const) {
      const consumeActionCodeWithExchangeEvent = vi
        .fn()
        .mockResolvedValue({ ok: false, reason });
      const result = await handleExchangeActionCode({
        body: { client_id: REGISTERED_CLIENT, action_code: "vana_ac_x" },
        consumeActionCodeWithExchangeEvent,
      });
      expect(result.kind).toBe("error");
      if (result.kind !== "error") continue;
      expect(result.code).toBe("invalid_grant");
    }

    const expiredResult = await handleExchangeActionCode({
      body: { client_id: REGISTERED_CLIENT, action_code: "vana_ac_x" },
      consumeActionCodeWithExchangeEvent: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "expired" }),
    });
    expect(expiredResult.kind).toBe("error");
    if (expiredResult.kind !== "error") return;
    expect(expiredResult.code).toBe("expired_grant");
  });
});

describe("handleActionDecision", () => {
  function buildPendingRequest(
    overrides: Partial<ActionRequestRow> = {},
  ): ActionRequestRow {
    const now = new Date();
    const { row } = createActionRequestRow({
      clientId: REGISTERED_CLIENT,
      vanaUserId: null,
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { connector: "mock" },
      redirectUri: REGISTERED_REDIRECT,
      now,
    });
    return { ...row, ...overrides };
  }

  function fakeRequest() {
    return new Request(
      "https://account.vana.org/api/account/actions/x/decision",
      {
        method: "POST",
      },
    );
  }

  function buildInput(
    overrides: Partial<Parameters<typeof handleActionDecision>[0]> = {},
  ) {
    const pending = buildPendingRequest();
    const persistedApproved: ActionRequestRow = {
      ...pending,
      status: "approved",
      vana_user_id: VANA_USER_ID,
      decided_at: new Date().toISOString(),
    };
    return {
      request: fakeRequest(),
      actionRequestId: pending.id,
      body: { decision: "approved" },
      resolveVanaUserId: fakeResolveVanaUserId(VANA_USER_ID),
      findActionRequestById: vi.fn().mockResolvedValue(pending),
      persistActionDecisionBundle: vi.fn(
        async ({
          result,
          event,
        }: {
          result: ActionResultRow | null;
          event: ConsentEventRow;
        }) => ({
          request: persistedApproved,
          result,
          event,
        }),
      ),
      ...overrides,
    } as Parameters<typeof handleActionDecision>[0];
  }

  it("returns 401 when no login evidence is present", async () => {
    const input = buildInput({
      resolveVanaUserId: fakeResolveVanaUserId(null),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(401);
    expect(result.code).toBe("login_required");
  });

  it("rejects a non-canonical subject before mutating the request", async () => {
    const persistActionDecisionBundle = vi.fn();
    const input = buildInput({
      resolveVanaUserId: fakeResolveVanaUserId("did:privy:user-1"),
      persistActionDecisionBundle,
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_subject");
    expect(persistActionDecisionBundle).not.toHaveBeenCalled();
  });

  it("returns 404 when the request is unknown", async () => {
    const input = buildInput({
      findActionRequestById: vi.fn().mockResolvedValue(null),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(404);
  });

  it("returns 403 when the request is bound to a different vana_user_id", async () => {
    const otherOwned = buildPendingRequest({
      vana_user_id: OTHER_VANA_USER_ID,
    });
    const input = buildInput({
      findActionRequestById: vi.fn().mockResolvedValue(otherOwned),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
  });

  it("returns 409 when the pending gate fails", async () => {
    const input = buildInput({
      persistActionDecisionBundle: vi.fn().mockResolvedValue(null),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(409);
    expect(result.code).toBe("not_pending");
  });

  it("rejects non-mock approval before mutating the request", async () => {
    const nonMockRequest = buildPendingRequest({
      execution_mode: "byo_wallet_client_signed",
    });
    const persistActionDecisionBundle = vi.fn();
    const input = buildInput({
      findActionRequestById: vi.fn().mockResolvedValue(nonMockRequest),
      persistActionDecisionBundle,
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(409);
    expect(result.code).toBe("unsupported_action_mode");
    expect(persistActionDecisionBundle).not.toHaveBeenCalled();
  });

  it("approves a pending request and emits a redirect with action_code only", async () => {
    const persistActionDecisionBundle = vi.fn(
      async ({
        result,
        event,
      }: {
        result: ActionResultRow | null;
        event: ConsentEventRow;
      }) => ({
        request: {
          ...buildPendingRequest(),
          status: "approved" as const,
          vana_user_id: VANA_USER_ID,
          decided_at: new Date().toISOString(),
        },
        result,
        event,
      }),
    );
    const input = buildInput({ persistActionDecisionBundle });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.decision).toBe("approved");
    const redirect = new URL(result.body.redirect_url ?? "");
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REGISTERED_REDIRECT);
    expect([...redirect.searchParams.keys()]).toEqual(["action_code"]);
    expect(redirect.searchParams.get("action_code")).toMatch(
      /^vana_ac_[a-f0-9]{64}$/,
    );

    expect(persistActionDecisionBundle).toHaveBeenCalledOnce();
    const approvalCall = persistActionDecisionBundle.mock.calls[0][0] as {
      result: ActionResultRow | null;
      event: ConsentEventRow;
    };
    const resultRow = approvalCall.result;
    expect(resultRow).not.toBeNull();
    if (!resultRow) return;
    expect(resultRow.action_code_hash).toBe(
      hashActionCode(redirect.searchParams.get("action_code") ?? ""),
    );
    expect(resultRow.result_payload).toEqual({
      mock: true,
      action_type: "mock.echo",
    });

    const consentRow = approvalCall.event;
    expect(consentRow.event_type).toBe("action.approved");
    expect(consentRow.decision).toBe("approved");
    expect(consentRow.vana_user_id).toBe(VANA_USER_ID);
  });

  it("denies a pending request and emits a redirect without action_code", async () => {
    const persistedDenied: ActionRequestRow = {
      ...buildPendingRequest(),
      status: "denied",
      vana_user_id: VANA_USER_ID,
      decided_at: new Date().toISOString(),
    };
    const persistActionDecisionBundle = vi.fn(
      async ({ event }: { event: ConsentEventRow }) => ({
        request: persistedDenied,
        result: null,
        event,
      }),
    );
    const input = buildInput({
      body: { decision: "denied" },
      persistActionDecisionBundle,
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.decision).toBe("denied");
    const redirect = new URL(result.body.redirect_url ?? "");
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REGISTERED_REDIRECT);
    expect([...redirect.searchParams.keys()]).toEqual([]);
    expect(persistActionDecisionBundle).toHaveBeenCalledOnce();
    const denialCall = persistActionDecisionBundle.mock.calls[0][0] as {
      result: ActionResultRow | null;
      event: ConsentEventRow;
    };
    expect(denialCall.result).toBeNull();
    expect(denialCall.event.event_type).toBe("action.denied");
  });

  it("rejects approval when state is required but missing", async () => {
    const stateful = buildPendingRequest({
      state_hash:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    });
    const input = buildInput({
      findActionRequestById: vi.fn().mockResolvedValue(stateful),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.message).toContain("state");
  });

  it("rejects approval when presented state hash does not match", async () => {
    const stateful = buildPendingRequest({
      state_hash:
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    });
    const input = buildInput({
      body: { decision: "approved", state: "wrong-state" },
      findActionRequestById: vi.fn().mockResolvedValue(stateful),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
  });

  it("approves with state and replays it on the redirect when hashes match", async () => {
    const presentedState = "client-state-xyz";
    // sha256 hex of "client-state-xyz"
    const stateHash =
      "2a6db8c100f06ea2c6039c4d319e5cf7262d6268eec8d53db6971d9f7ecc4eb9";
    const pending = buildPendingRequest({ state_hash: stateHash });
    const persistedApproved: ActionRequestRow = {
      ...pending,
      status: "approved",
      vana_user_id: VANA_USER_ID,
      decided_at: new Date().toISOString(),
    };
    const input = buildInput({
      body: { decision: "approved", state: presentedState },
      findActionRequestById: vi.fn().mockResolvedValue(pending),
      persistActionDecisionBundle: vi
        .fn()
        .mockImplementation(
          async ({ result, event }: { result: unknown; event: unknown }) => ({
            request: persistedApproved,
            result,
            event,
          }),
        ),
    });
    const result = await handleActionDecision(input);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const redirect = new URL(result.body.redirect_url ?? "");
    expect([...redirect.searchParams.keys()].sort()).toEqual([
      "action_code",
      "state",
    ]);
    expect(redirect.searchParams.get("state")).toBe(presentedState);
  });
});
