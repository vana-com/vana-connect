import { describe, expect, it } from "vitest";
import {
  ACTION_CODE_TTL_SECONDS,
  ACTION_REQUEST_TTL_SECONDS,
  type ActionRequestRow,
  type ActionResultRow,
  buildConsentEventRow,
  buildMockActionResult,
  buildRedirectParams,
  CONSENT_EVENT_SCHEMA_VERSION,
  canonicalRequestHash,
  createActionRequestRow,
  decideActionRequest,
  generateActionCode,
  generateActionRequestId,
  hashActionCode,
  validateActionCodeExchange,
} from "./account-action";

const NOW = new Date("2026-04-28T00:00:00.000Z");
const VANA_USER_ID = `vana_user_${"a".repeat(32)}`;

function makeRequest(
  overrides: Partial<Parameters<typeof createActionRequestRow>[0]> = {},
): ActionRequestRow {
  const { row } = createActionRequestRow({
    clientId: "client_memory_app",
    vanaUserId: VANA_USER_ID,
    actionType: "mock.echo",
    executionMode: "mock",
    resultMode: "mock",
    requestedData: { scopes: ["memory.read"], purposeCode: "demo" },
    redirectUri: "https://memory.example.com/callback",
    state: "client-state-xyz",
    displayMetadata: { title: "Memory App", description: "Read mock memory" },
    now: NOW,
    ...overrides,
  });
  return row;
}

describe("createActionRequestRow", () => {
  it("creates a pending request with hashed state and a default 10-minute TTL", () => {
    const row = makeRequest();
    expect(row.id).toMatch(/^vana_areq_[a-f0-9]{32}$/);
    expect(row.status).toBe("pending");
    expect(row.execution_mode).toBe("mock");
    expect(row.result_mode).toBe("mock");
    expect(row.created_at).toBe(NOW.toISOString());
    expect(Date.parse(row.expires_at) - NOW.getTime()).toBe(
      ACTION_REQUEST_TTL_SECONDS * 1000,
    );

    expect(row.state_hash).toBeTypeOf("string");
    expect(row.state_hash).not.toBe("client-state-xyz");
    expect(row.state_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces a stable request hash that is independent of unstable fields", () => {
    const a = canonicalRequestHash({
      clientId: "c1",
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { scopes: ["x"] },
      redirectUri: "https://example.com/cb",
    });
    const b = canonicalRequestHash({
      clientId: "c1",
      actionType: "mock.echo",
      executionMode: "mock",
      resultMode: "mock",
      requestedData: { scopes: ["x"] },
      redirectUri: "https://example.com/cb",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("includes requested data semantics in the request hash", () => {
    const base = {
      clientId: "c1",
      actionType: "mock.echo",
      executionMode: "mock" as const,
      resultMode: "mock" as const,
      redirectUri: "https://example.com/cb",
    };

    const reordered = canonicalRequestHash({
      ...base,
      requestedData: {
        accessMode: "read_until_revoked",
        purposeCode: "demo",
        purposeDescription: "Read data for memory.",
        scopes: ["x"],
      },
    });
    const sameMeaningDifferentKeyOrder = canonicalRequestHash({
      ...base,
      requestedData: {
        scopes: ["x"],
        purposeDescription: "Read data for memory.",
        purposeCode: "demo",
        accessMode: "read_until_revoked",
      },
    });
    const differentAccessMode = canonicalRequestHash({
      ...base,
      requestedData: {
        accessMode: "one_time",
        purposeCode: "demo",
        purposeDescription: "Read data for memory.",
        scopes: ["x"],
      },
    });
    const differentScope = canonicalRequestHash({
      ...base,
      requestedData: {
        accessMode: "read_until_revoked",
        purposeCode: "demo",
        purposeDescription: "Read data for memory.",
        scopes: ["y"],
      },
    });

    expect(reordered).toBe(sameMeaningDifferentKeyOrder);
    expect(differentAccessMode).not.toBe(reordered);
    expect(differentScope).not.toBe(reordered);
  });
});

describe("decideActionRequest", () => {
  it("transitions pending → approved and stamps decided_at", () => {
    const req = makeRequest();
    const decided = decideActionRequest({
      request: req,
      decision: "approved",
      vanaUserId: req.vana_user_id ?? VANA_USER_ID,
      now: NOW,
    });
    expect(decided.status).toBe("approved");
    expect(decided.decided_at).toBe(NOW.toISOString());
  });

  it("refuses to decide an expired request", () => {
    const req = makeRequest();
    const after = new Date(
      NOW.getTime() + (ACTION_REQUEST_TTL_SECONDS + 1) * 1000,
    );
    expect(() =>
      decideActionRequest({
        request: req,
        decision: "approved",
        vanaUserId: VANA_USER_ID,
        now: after,
      }),
    ).toThrow(/has expired/);
  });

  it("refuses to re-decide a non-pending request", () => {
    const req = makeRequest();
    const approved = decideActionRequest({
      request: req,
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    expect(() =>
      decideActionRequest({
        request: approved,
        decision: "denied",
        vanaUserId: VANA_USER_ID,
        now: NOW,
      }),
    ).toThrow(/is not pending/);
  });
});

describe("buildMockActionResult — mock-only invariants", () => {
  it("creates a mock result that stores only a hash of the action_code", () => {
    const req = decideActionRequest({
      request: makeRequest(),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    const code = generateActionCode();
    const result = buildMockActionResult({
      request: req,
      actionCode: code,
      now: NOW,
    });

    expect(result.action_code_hash).toBe(hashActionCode(code));
    expect(result.action_code_hash).not.toBe(code);

    expect(result.result_mode).toBe("mock");
    expect(result.result_reference).toBeNull();
    expect(result.result_payload).toEqual({
      mock: true,
      action_type: "mock.echo",
    });

    expect(Date.parse(result.expires_at) - NOW.getTime()).toBe(
      ACTION_CODE_TTL_SECONDS * 1000,
    );
    expect(ACTION_CODE_TTL_SECONDS).toBeLessThanOrEqual(300);
  });

  it("rejects BYO-wallet execution mode so the backend cannot silently sign", () => {
    const req = decideActionRequest({
      request: makeRequest({ executionMode: "byo_wallet_client_signed" }),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    expect(() =>
      buildMockActionResult({
        request: req,
        actionCode: generateActionCode(),
        now: NOW,
      }),
    ).toThrow(
      /refusing to backend-sign execution_mode=byo_wallet_client_signed/,
    );
  });

  it("accepts embedded-wallet execution mode (grant minting is server-side)", () => {
    // The hosted-wallet flow proves authority via PS OAuth2 + EIP-712 signed
    // by the PS's own key, so the result envelope can be backend-built without
    // user signing. The route caller stitches the real grantId onto the
    // result_payload alongside the mock marker.
    const req = decideActionRequest({
      request: makeRequest({ executionMode: "embedded_wallet_account_hosted" }),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    const result = buildMockActionResult({
      request: req,
      actionCode: generateActionCode(),
      now: NOW,
    });
    expect(result.action_request_id).toBe(req.id);
    expect(result.result_mode).toBe("mock");
  });

  it("still rejects delegated_runtime execution mode (not yet a supported backend path)", () => {
    const req = decideActionRequest({
      request: makeRequest({ executionMode: "delegated_runtime" }),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    expect(() =>
      buildMockActionResult({
        request: req,
        actionCode: generateActionCode(),
        now: NOW,
      }),
    ).toThrow(/execution_mode=delegated_runtime/);
  });

  it("rejects encrypted_bundle_reference result_mode in the mock helper", () => {
    const req = decideActionRequest({
      request: makeRequest({ resultMode: "encrypted_bundle_reference" }),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    expect(() =>
      buildMockActionResult({
        request: req,
        actionCode: generateActionCode(),
        now: NOW,
      }),
    ).toThrow(/encrypted bundle reference/);
  });
});

describe("buildRedirectParams — no raw user data", () => {
  it("returns exactly action_code and state, never user data", () => {
    const code = generateActionCode();
    const params = buildRedirectParams({ actionCode: code, state: "s-123" });
    expect(Object.keys(params).sort()).toEqual(["action_code", "state"]);
    expect(params.action_code).toBe(code);
    expect(params.state).toBe("s-123");
  });

  it("omits state when not provided and never substitutes user data", () => {
    const code = generateActionCode();
    const params = buildRedirectParams({ actionCode: code });
    expect(Object.keys(params)).toEqual(["action_code"]);
  });

  it("redirect params from a fully-formed mock flow contain no raw user data", () => {
    const req = decideActionRequest({
      request: makeRequest(),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    const code = generateActionCode();
    const result = buildMockActionResult({
      request: req,
      actionCode: code,
      now: NOW,
    });
    const params = buildRedirectParams({ actionCode: code, state: "s" });
    const serialized = JSON.stringify(params);
    expect(Object.keys(params).sort()).toEqual(["action_code", "state"]);
    expect(serialized).not.toContain(req.requested_data.scopes?.[0] ?? "");
    expect(result.result_payload).toEqual({
      mock: true,
      action_type: "mock.echo",
    });
  });
});

describe("validateActionCodeExchange — short-lived & client-bound", () => {
  function approvedResult(): { code: string; result: ActionResultRow } {
    const req = decideActionRequest({
      request: makeRequest(),
      decision: "approved",
      vanaUserId: VANA_USER_ID,
      now: NOW,
    });
    const code = generateActionCode();
    const result = buildMockActionResult({
      request: req,
      actionCode: code,
      now: NOW,
    });
    return { code, result };
  }

  it("accepts a valid code presented by the binding client before expiry", () => {
    const { code, result } = approvedResult();
    const outcome = validateActionCodeExchange({
      result,
      presentedCode: code,
      presentingClientId: "client_memory_app",
      now: NOW,
    });
    expect(outcome.ok).toBe(true);
  });

  it("rejects a code presented by a different client (client binding)", () => {
    const { code, result } = approvedResult();
    const outcome = validateActionCodeExchange({
      result,
      presentedCode: code,
      presentingClientId: "client_other_app",
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("client_mismatch");
    }
  });

  it("rejects a code presented after expiry (short-lived)", () => {
    const { code, result } = approvedResult();
    const after = new Date(Date.parse(result.expires_at) + 1_000);
    const outcome = validateActionCodeExchange({
      result,
      presentedCode: code,
      presentingClientId: "client_memory_app",
      now: after,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("expired");
    }
    // And the code must not live longer than a few minutes.
    expect(
      Date.parse(result.expires_at) - Date.parse(result.created_at),
    ).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("rejects a wrong code without leaking which check failed", () => {
    const { result } = approvedResult();
    const outcome = validateActionCodeExchange({
      result,
      presentedCode: generateActionCode(),
      presentingClientId: "client_memory_app",
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("not_found");
    }
  });

  it("rejects a previously-consumed code", () => {
    const { code, result } = approvedResult();
    const consumed: ActionResultRow = {
      ...result,
      consumed_at: NOW.toISOString(),
    };
    const outcome = validateActionCodeExchange({
      result: consumed,
      presentedCode: code,
      presentingClientId: "client_memory_app",
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("consumed");
    }
  });
});

describe("buildConsentEventRow — DP RPC-compatible event shape", () => {
  it("includes the minimum DP RPC-compatible fields with the action's modes carried through", () => {
    const req = makeRequest();
    const requestHash = canonicalRequestHash({
      clientId: req.client_id,
      actionType: req.action_type,
      executionMode: req.execution_mode,
      resultMode: req.result_mode,
      requestedData: req.requested_data,
      redirectUri: req.redirect_uri,
    });

    const event = buildConsentEventRow({
      request: req,
      eventType: "action.approved",
      decision: "approved",
      idempotencyKey: `${req.id}:approved`,
      requestHash,
      issuer: "account.vana.org",
      now: NOW,
      auditMetadata: { user_agent: "test" },
    });

    expect(event.id).toMatch(/^vana_evt_[a-f0-9]{32}$/);
    expect(event.schema_version).toBe(CONSENT_EVENT_SCHEMA_VERSION);
    expect(event.event_type).toBe("action.approved");
    expect(event.occurred_at).toBe(NOW.toISOString());
    expect(event.issuer).toBe("account.vana.org");
    expect(event.client_id).toBe(req.client_id);
    expect(event.action_request_id).toBe(req.id);
    expect(event.action_type).toBe(req.action_type);
    expect(event.requested_data).toEqual(req.requested_data);
    expect(event.execution_mode).toBe("mock");
    expect(event.result_mode).toBe("mock");
    expect(event.idempotency_key).toBe(`${req.id}:approved`);
    expect(event.request_hash).toBe(requestHash);
    expect(event.audit_metadata).toEqual({ user_agent: "test" });

    // Protocol fields stay nullable until the protocol write actually exists.
    expect(event.protocol_principal).toBeNull();
    expect(event.authorization_reference).toBeNull();
  });
});

describe("hashActionCode", () => {
  it("is deterministic and never returns the raw code", () => {
    const code = generateActionCode();
    expect(hashActionCode(code)).toBe(hashActionCode(code));
    expect(hashActionCode(code)).not.toBe(code);
    expect(hashActionCode(code)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("generateActionRequestId", () => {
  it("returns a vana_areq_-prefixed opaque id distinct from any user identifier", () => {
    const id = generateActionRequestId();
    expect(id).toMatch(/^vana_areq_[a-f0-9]{32}$/);
    expect(id).not.toContain("0x");
    expect(id).not.toContain("@");
  });
});
