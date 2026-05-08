import crypto from "node:crypto";

/**
 * Pure model helpers for the account-hosted action request/result/code-exchange
 * flow described in the account-oidc-privy-actions design (D6, D7, D10, D11).
 *
 * The first model slice uses `mock` execution mode and `mock`
 * result mode end-to-end. The model keeps forward-compatible enum values
 * for `embedded_wallet_account_hosted`, `byo_wallet_client_signed`,
 * `delegated_runtime`, and `encrypted_bundle_reference` so future slices
 * can land without a schema migration.
 *
 * Invariants enforced here (and asserted by the test suite):
 *
 *   - `action_code` is short-lived and client-bound. The raw code is never
 *     stored or logged; only its hash is persisted via {@link hashActionCode}.
 *   - Redirect parameters carry `action_code` and `state` only; raw user
 *     data must never appear in {@link buildRedirectParams}.
 *   - BYO-wallet execution mode cannot produce a backend-built result. Live
 *     BYO-wallet flows must come back through a separate client-signing
 *     code path.
 *   - The `mock` result mode carries a fixed non-user-data payload. Non-mock
 *     result modes must carry a `result_reference` and must not embed a
 *     plaintext `result_payload`.
 *   - {@link validateActionCodeExchange} validates an already-loaded result.
 *     A production route must pair these checks with an atomic
 *     `consumed_at IS NULL ... UPDATE ... RETURNING` operation.
 */

export type ActionExecutionMode =
  | "mock"
  | "embedded_wallet_account_hosted"
  | "byo_wallet_client_signed"
  | "delegated_runtime";

export type ActionResultMode = "mock" | "encrypted_bundle_reference";

export type ActionRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "consumed"
  | "revoked";

export type ConsentEventType =
  | "action.requested"
  | "action.approved"
  | "action.denied"
  | "action.completed"
  | "action.exchanged"
  | "action.expired"
  | "action.revoked";

export const CONSENT_EVENT_SCHEMA_VERSION = 1;

export const ACTION_CODE_TTL_SECONDS = 120;
export const ACTION_REQUEST_TTL_SECONDS = 600;

const ACTION_REQUEST_PREFIX = "vana_areq_";
const ACTION_RESULT_PREFIX = "vana_ares_";
const ACTION_CODE_PREFIX = "vana_ac_";
const CONSENT_EVENT_PREFIX = "vana_evt_";

export type RequestedData = {
  connector?: string;
  scopes?: string[];
  purposeCode?: string;
  purposeDescription?: string;
  accessMode?: string;
};

export type DisplayMetadata = {
  title?: string;
  description?: string;
  iconUrl?: string;
};

export type ActionRequestInput = {
  clientId: string;
  vanaUserId?: string | null;
  actionType: string;
  executionMode: ActionExecutionMode;
  resultMode: ActionResultMode;
  requestedData: RequestedData;
  redirectUri: string;
  state?: string;
  displayMetadata?: DisplayMetadata;
  now: Date;
  ttlSeconds?: number;
};

export type ActionRequestRow = {
  id: string;
  client_id: string;
  vana_user_id: string | null;
  action_type: string;
  execution_mode: ActionExecutionMode;
  result_mode: ActionResultMode;
  requested_data: RequestedData;
  redirect_uri: string;
  state_hash: string | null;
  status: ActionRequestStatus;
  display_metadata: DisplayMetadata | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
};

export type ActionResultRow = {
  id: string;
  action_request_id: string;
  client_id: string;
  action_code_hash: string;
  result_mode: ActionResultMode;
  result_payload: Record<string, unknown> | null;
  result_reference: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export type MockActionResultPayload = {
  mock: true;
  action_type: string;
};

export type AccountHostedGrantActionResultPayload = {
  action_type: string;
  grant_id: string;
  grantee_address: string;
  personal_server_id: string;
  personal_server_url: string;
};

export type ConsentEventRow = {
  id: string;
  schema_version: number;
  event_type: ConsentEventType;
  occurred_at: string;
  issuer: string;
  vana_user_id: string | null;
  subject_wallet_address: string | null;
  client_id: string;
  application_id: string | null;
  protocol_principal: Record<string, unknown> | null;
  action_request_id: string | null;
  action_type: string;
  requested_data: RequestedData;
  decision: "approved" | "denied" | null;
  execution_mode: ActionExecutionMode;
  result_mode: ActionResultMode;
  authorization_reference: Record<string, unknown> | null;
  idempotency_key: string;
  request_hash: string;
  audit_metadata: Record<string, unknown> | null;
};

export function generateActionRequestId(): string {
  return `${ACTION_REQUEST_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function generateActionResultId(): string {
  return `${ACTION_RESULT_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function generateConsentEventId(): string {
  return `${CONSENT_EVENT_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Generate a single-use, opaque `action_code` returned to the client through
 * the redirect. The raw code is only ever held in memory in the request
 * handler that issues it; persistence stores {@link hashActionCode} instead.
 */
export function generateActionCode(): string {
  return `${ACTION_CODE_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
}

export function hashActionCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function hashState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}

/**
 * Canonical hash of the user-visible action request. Used as `request_hash`
 * on consent events so a later auditor can verify that what the user saw
 * matches what the client requested without keeping a verbatim copy.
 */
export function canonicalRequestHash(input: {
  clientId: string;
  actionType: string;
  executionMode: ActionExecutionMode;
  resultMode: ActionResultMode;
  requestedData: RequestedData;
  redirectUri: string;
}): string {
  const canonical = stableJson(input);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJson(entryValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function createActionRequestRow(input: ActionRequestInput): {
  row: ActionRequestRow;
  requestHash: string;
} {
  const ttl = input.ttlSeconds ?? ACTION_REQUEST_TTL_SECONDS;
  const expiresAt = new Date(input.now.getTime() + ttl * 1000);
  const row: ActionRequestRow = {
    id: generateActionRequestId(),
    client_id: input.clientId,
    vana_user_id: input.vanaUserId ?? null,
    action_type: input.actionType,
    execution_mode: input.executionMode,
    result_mode: input.resultMode,
    requested_data: input.requestedData,
    redirect_uri: input.redirectUri,
    state_hash: input.state ? hashState(input.state) : null,
    status: "pending",
    display_metadata: input.displayMetadata ?? null,
    created_at: input.now.toISOString(),
    expires_at: expiresAt.toISOString(),
    decided_at: null,
  };
  const requestHash = canonicalRequestHash({
    clientId: input.clientId,
    actionType: input.actionType,
    executionMode: input.executionMode,
    resultMode: input.resultMode,
    requestedData: input.requestedData,
    redirectUri: input.redirectUri,
  });
  return { row, requestHash };
}

export function decideActionRequest(input: {
  request: ActionRequestRow;
  decision: "approved" | "denied";
  vanaUserId: string;
  now: Date;
}): ActionRequestRow {
  if (input.request.status !== "pending") {
    throw new Error(
      `decideActionRequest: request ${input.request.id} is not pending (status=${input.request.status})`,
    );
  }
  if (Date.parse(input.request.expires_at) <= input.now.getTime()) {
    throw new Error(
      `decideActionRequest: request ${input.request.id} has expired`,
    );
  }
  return {
    ...input.request,
    status: input.decision,
    vana_user_id: input.vanaUserId,
    decided_at: input.now.toISOString(),
  };
}

/**
 * Issue a mock result for an approved request. Rejects any execution mode
 * other than `mock`; real embedded-wallet grants use
 * {@link buildAccountHostedGrantActionResult} after the Personal Server has
 * minted the grant.
 */
export function buildMockActionResult(input: {
  request: ActionRequestRow;
  actionCode: string;
  now: Date;
  ttlSeconds?: number;
}): ActionResultRow {
  if (input.request.status !== "approved") {
    throw new Error(
      `buildMockActionResult: request ${input.request.id} is not approved`,
    );
  }
  if (input.request.execution_mode !== "mock") {
    throw new Error(
      `buildMockActionResult: refusing execution_mode=${input.request.execution_mode}; only 'mock' may produce a mock result`,
    );
  }
  if (input.request.result_mode !== "mock") {
    throw new Error(
      `buildMockActionResult: result_mode=${input.request.result_mode} requires an encrypted bundle reference, not a mock payload`,
    );
  }
  const ttl = input.ttlSeconds ?? ACTION_CODE_TTL_SECONDS;
  return {
    id: generateActionResultId(),
    action_request_id: input.request.id,
    client_id: input.request.client_id,
    action_code_hash: hashActionCode(input.actionCode),
    result_mode: "mock",
    result_payload: { mock: true, action_type: input.request.action_type },
    result_reference: null,
    created_at: input.now.toISOString(),
    expires_at: new Date(input.now.getTime() + ttl * 1000).toISOString(),
    consumed_at: null,
  };
}

export function buildAccountHostedGrantActionResult(input: {
  request: ActionRequestRow;
  actionCode: string;
  grant: {
    grantId: string;
    granteeAddress: string;
    personalServer: { serverId: string; serverUrl: string };
  };
  now: Date;
  ttlSeconds?: number;
}): ActionResultRow {
  if (input.request.status !== "approved") {
    throw new Error(
      `buildAccountHostedGrantActionResult: request ${input.request.id} is not approved`,
    );
  }
  if (input.request.execution_mode !== "embedded_wallet_account_hosted") {
    throw new Error(
      `buildAccountHostedGrantActionResult: refusing execution_mode=${input.request.execution_mode}; only 'embedded_wallet_account_hosted' may return a hosted grant result`,
    );
  }
  if (input.request.result_mode !== "mock") {
    throw new Error(
      `buildAccountHostedGrantActionResult: result_mode=${input.request.result_mode} requires an encrypted bundle reference, not an inline grant payload`,
    );
  }
  const ttl = input.ttlSeconds ?? ACTION_CODE_TTL_SECONDS;
  return {
    id: generateActionResultId(),
    action_request_id: input.request.id,
    client_id: input.request.client_id,
    action_code_hash: hashActionCode(input.actionCode),
    result_mode: "mock",
    result_payload: {
      action_type: input.request.action_type,
      grant_id: input.grant.grantId,
      grantee_address: input.grant.granteeAddress,
      personal_server_id: input.grant.personalServer.serverId,
      personal_server_url: input.grant.personalServer.serverUrl,
    } satisfies AccountHostedGrantActionResultPayload,
    result_reference: null,
    created_at: input.now.toISOString(),
    expires_at: new Date(input.now.getTime() + ttl * 1000).toISOString(),
    consumed_at: null,
  };
}

export type ActionCodeValidationFailure =
  | "not_found"
  | "client_mismatch"
  | "expired"
  | "consumed";

export function validateActionCodeExchange(input: {
  result: ActionResultRow | null | undefined;
  presentedCode: string;
  presentingClientId: string;
  now: Date;
}):
  | { ok: true; result: ActionResultRow }
  | { ok: false; reason: ActionCodeValidationFailure } {
  const { result, presentedCode, presentingClientId, now } = input;
  if (!result) {
    return { ok: false, reason: "not_found" };
  }
  const presentedHash = hashActionCode(presentedCode);
  if (!timingSafeEqualHex(presentedHash, result.action_code_hash)) {
    return { ok: false, reason: "not_found" };
  }
  if (result.client_id !== presentingClientId) {
    return { ok: false, reason: "client_mismatch" };
  }
  if (Date.parse(result.expires_at) <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (result.consumed_at !== null) {
    return { ok: false, reason: "consumed" };
  }
  return { ok: true, result };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Build the redirect query parameters returned to the client after a
 * decision. This helper is the single source of truth for what may appear
 * in a redirect URL: `action_code` and `state` only. Any attempt to
 * smuggle raw user data through here is rejected by the test suite, which
 * asserts the parameter set is exactly `{action_code, state?}`.
 */
export function buildRedirectParams(input: {
  actionCode: string;
  state?: string;
}): Record<string, string> {
  const params: Record<string, string> = { action_code: input.actionCode };
  if (input.state !== undefined) {
    params.state = input.state;
  }
  return params;
}

export function buildConsentEventRow(input: {
  request: ActionRequestRow;
  eventType: ConsentEventType;
  decision?: "approved" | "denied" | null;
  vanaUserId?: string | null;
  subjectWalletAddress?: string | null;
  applicationId?: string | null;
  protocolPrincipal?: Record<string, unknown> | null;
  authorizationReference?: Record<string, unknown> | null;
  idempotencyKey: string;
  requestHash: string;
  auditMetadata?: Record<string, unknown> | null;
  issuer: string;
  now: Date;
}): ConsentEventRow {
  return {
    id: generateConsentEventId(),
    schema_version: CONSENT_EVENT_SCHEMA_VERSION,
    event_type: input.eventType,
    occurred_at: input.now.toISOString(),
    issuer: input.issuer,
    vana_user_id: input.vanaUserId ?? input.request.vana_user_id,
    subject_wallet_address: input.subjectWalletAddress ?? null,
    client_id: input.request.client_id,
    application_id: input.applicationId ?? null,
    protocol_principal: input.protocolPrincipal ?? null,
    action_request_id: input.request.id,
    action_type: input.request.action_type,
    requested_data: input.request.requested_data,
    decision: input.decision ?? null,
    execution_mode: input.request.execution_mode,
    result_mode: input.request.result_mode,
    authorization_reference: input.authorizationReference ?? null,
    idempotency_key: input.idempotencyKey,
    request_hash: input.requestHash,
    audit_metadata: input.auditMetadata ?? null,
  };
}
