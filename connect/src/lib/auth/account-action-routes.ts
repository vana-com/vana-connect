/**
 * Pure handler logic for the account-hosted action API surface (design.md
 * D6/D7/D10/D11; tasks.md 7.4, 7.7, 7.8, 7.9).
 *
 * The App Router route files wire production deps (DB helpers, login session
 * adapter, vana-user resolver) into thin runtime modules and call into these
 * handlers. Tests inject fake deps so they never need a running Next.js
 * server, Postgres, or Privy.
 *
 * The first slice supports `execution_mode = "mock"` and `result_mode = "mock"`
 * end-to-end. Other modes are recognized at the model layer but rejected here
 * with a stable 400 so a mistakenly-issued non-mock request never silently
 * succeeds without the corresponding signing/encryption path.
 *
 * Security invariants enforced here (asserted by the test suite):
 *
 *   - `client_id` must resolve to a registered {@link OauthClientRecord}.
 *   - `redirect_uri` must pass {@link checkRedirectUri} (exact-match,
 *     no CRLF, no protocol-relative, https or loopback http only).
 *   - Action requests are persisted with `vana_user_id = null` until a
 *     decision route binds them to the current logged-in user.
 *   - Action codes are never returned in clear text outside the issuing
 *     handler's return value; persisted rows only carry the hash.
 *   - Exchange responses carry `result_mode` and the mock payload only;
 *     `action_code_hash`, `vana_user_id`, and other internal fields are
 *     never serialized to the OAuth client.
 *   - Decision approval/denial routes resolve the acting user from a
 *     {@link LoginEvidence} value via the configured resolver. The
 *     `vana_user_id` is never read from request body or query.
 */

import crypto from "node:crypto";
import {
  ACTION_CODE_TTL_SECONDS,
  type ActionExecutionMode,
  type ActionRequestRow,
  type ActionResultMode,
  type ActionResultRow,
  buildAccountHostedGrantActionResult,
  buildConsentEventRow,
  buildMockActionResult,
  buildRedirectParams,
  type ConsentEventRow,
  canonicalRequestHash,
  createActionRequestRow,
  type DisplayMetadata,
  generateActionCode,
  type RequestedData,
} from "./account-action";
import type { ExecuteGrantResult } from "./execute-grant-via-personal-server";

/**
 * Pulls the canonical `vana_user_id` for the current request. Returns `null`
 * for unauthenticated requests; routes treat that as 401.
 *
 * In production this wraps `getVanaSession(req)` (see PR-Y in
 * `docs/auth-redesign/01-architecture.md`); tests inject a fake.
 */
export type ResolveVanaUserId = (request: Request) => Promise<string | null>;

import {
  checkRedirectUri,
  createDefaultOauthClientRegistry,
  type OauthClientRegistry,
} from "./oauth-client-policy";
import { isVanaUserId } from "./vana-account";

export const DEFAULT_ACCOUNT_ACTION_ISSUER =
  process.env.VANA_ACCOUNT_ISSUER ?? "https://account.vana.org";

export type CreateActionRequestInput = {
  body: unknown;
  registry?: OauthClientRegistry;
  now?: Date;
  /**
   * Persist the action-request row. Exposed as a seam so tests can mock the
   * DB without spinning up Postgres.
   */
  insertActionRequest: (row: ActionRequestRow) => Promise<ActionRequestRow>;
  /**
   * Persist an `action.requested` consent event. The schema intentionally
   * permits `vana_user_id = null` and nullable protocol fields so the
   * pre-user creation path can record the request hash and request shape;
   * later events bind the user when the decision route resolves them.
   * Required so the DP RPC-compatible mock seam (D11, task 8.5) is wired
   * end-to-end starting at request creation.
   */
  insertConsentEvent: (row: ConsentEventRow) => Promise<ConsentEventRow>;
  baseUrl?: string;
  issuer?: string;
};

export type CreateActionRequestResult =
  | {
      kind: "ok";
      status: 200;
      body: {
        action_request_id: string;
        action_url: string;
        expires_at: string;
        execution_mode: ActionExecutionMode;
        result_mode: ActionResultMode;
      };
    }
  | { kind: "error"; status: 400 | 404; code: string; message: string };

export type GetActionRequestInput = {
  request: Request;
  actionRequestId: string;
  registry?: OauthClientRegistry;
  resolveVanaUserId: ResolveVanaUserId;
  findActionRequestById: (id: string) => Promise<ActionRequestRow | null>;
};

export type GetActionRequestResult =
  | {
      kind: "ok";
      status: 200;
      body: {
        action_request_id: string;
        status: ActionRequestRow["status"];
        client: {
          client_id: string;
          display_name: string;
        };
        action_type: string;
        execution_mode: ActionExecutionMode;
        result_mode: ActionResultMode;
        requested_data: RequestedData;
        display_metadata: DisplayMetadata | null;
        expires_at: string;
      };
    }
  | {
      kind: "error";
      status: 400 | 401 | 403 | 404;
      code: string;
      message: string;
    };

export async function handleGetActionRequest(
  input: GetActionRequestInput,
): Promise<GetActionRequestResult> {
  const vanaUserId = await input.resolveVanaUserId(input.request);
  if (!vanaUserId) {
    return {
      kind: "error",
      status: 401,
      code: "login_required",
      message: "Login evidence is required to view an action request",
    };
  }

  if (!isVanaUserId(vanaUserId)) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_subject",
      message: "Resolved action subject must be an opaque vana_user_id",
    };
  }

  const action = await input.findActionRequestById(input.actionRequestId);
  if (!action) {
    return {
      kind: "error",
      status: 404,
      code: "not_found",
      message: "Action request not found",
    };
  }

  if (action.vana_user_id !== null && action.vana_user_id !== vanaUserId) {
    return {
      kind: "error",
      status: 403,
      code: "forbidden",
      message: "Action request belongs to a different account",
    };
  }

  const registry = input.registry ?? createDefaultOauthClientRegistry();
  const client = registry.resolve(action.client_id);
  if (!client) {
    return {
      kind: "error",
      status: 404,
      code: "unknown_client",
      message: `Unknown client_id: ${action.client_id}`,
    };
  }

  return {
    kind: "ok",
    status: 200,
    body: {
      action_request_id: action.id,
      status: action.status,
      client: {
        client_id: client.clientId,
        display_name: client.displayName,
      },
      action_type: action.action_type,
      execution_mode: action.execution_mode,
      result_mode: action.result_mode,
      requested_data: action.requested_data,
      display_metadata: action.display_metadata,
      expires_at: action.expires_at,
    },
  };
}

// Create-time guard. Mirrors the relaxed approval guard in
// {@link handleActionDecision}: `embedded_wallet_account_hosted` is now
// supported end-to-end (real grants minted via PR #124). Result-mode is
// still mock-only until encrypted-bundle delivery lands.
const SUPPORTED_EXECUTION_MODES: readonly ActionExecutionMode[] = [
  "mock",
  "embedded_wallet_account_hosted",
];
const SUPPORTED_RESULT_MODES: readonly ActionResultMode[] = ["mock"];

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : undefined;
}

function parseRequestedData(value: unknown): RequestedData | null {
  if (!isStringRecord(value)) return null;
  const out: RequestedData = {};
  if (typeof value.connector === "string") out.connector = value.connector;
  if (
    Array.isArray(value.scopes) &&
    value.scopes.every((v) => typeof v === "string")
  ) {
    out.scopes = value.scopes as string[];
  }
  if (typeof value.purposeCode === "string")
    out.purposeCode = value.purposeCode;
  if (typeof value.purposeDescription === "string") {
    out.purposeDescription = value.purposeDescription;
  }
  if (typeof value.accessMode === "string") out.accessMode = value.accessMode;
  return out;
}

function parseDisplayMetadata(value: unknown): DisplayMetadata | undefined {
  if (!isStringRecord(value)) return undefined;
  const out: DisplayMetadata = {};
  if (typeof value.title === "string") out.title = value.title;
  if (typeof value.description === "string")
    out.description = value.description;
  if (typeof value.iconUrl === "string") out.iconUrl = value.iconUrl;
  return out;
}

/**
 * Validate input and create a new pending action request. Returns a
 * handler-shaped result so the route file can serialize it.
 */
export async function handleCreateActionRequest(
  input: CreateActionRequestInput,
): Promise<CreateActionRequestResult> {
  if (!isStringRecord(input.body)) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const clientId = asString(input.body.client_id);
  if (!clientId) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Missing required client_id",
    };
  }

  const registry = input.registry ?? createDefaultOauthClientRegistry();
  const client = registry.resolve(clientId);
  if (!client) {
    return {
      kind: "error",
      status: 400,
      code: "unknown_client",
      message: `Unknown client_id: ${clientId}`,
    };
  }

  const redirectDecision = checkRedirectUri(
    client,
    asString(input.body.redirect_uri),
  );
  if (redirectDecision.kind === "deny") {
    return {
      kind: "error",
      status: 400,
      code: redirectDecision.reason,
      message: redirectDecision.message,
    };
  }

  const actionType = asString(input.body.action_type);
  if (!actionType) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Missing required action_type",
    };
  }

  const executionMode = (asString(input.body.execution_mode) ??
    "mock") as ActionExecutionMode;
  if (!SUPPORTED_EXECUTION_MODES.includes(executionMode)) {
    return {
      kind: "error",
      status: 400,
      code: "unsupported_execution_mode",
      message: `execution_mode '${executionMode}' is not supported in this slice; only 'mock' is available`,
    };
  }

  const resultMode = (asString(input.body.result_mode) ??
    "mock") as ActionResultMode;
  if (!SUPPORTED_RESULT_MODES.includes(resultMode)) {
    return {
      kind: "error",
      status: 400,
      code: "unsupported_result_mode",
      message: `result_mode '${resultMode}' is not supported in this slice; only 'mock' is available`,
    };
  }

  const requestedData = parseRequestedData(input.body.requested_data);
  if (!requestedData) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid requested_data",
    };
  }

  const state = asOptionalString(input.body.state);
  const displayMetadata = parseDisplayMetadata(input.body.display_metadata);

  const now = input.now ?? new Date();
  const { row, requestHash } = createActionRequestRow({
    clientId: client.clientId,
    vanaUserId: null,
    actionType,
    executionMode,
    resultMode,
    requestedData,
    redirectUri: redirectDecision.redirectUri,
    state,
    displayMetadata,
    now,
  });

  const persisted = await input.insertActionRequest(row);

  const issuer = input.issuer ?? DEFAULT_ACCOUNT_ACTION_ISSUER;
  await input.insertConsentEvent(
    buildConsentEventRow({
      request: persisted,
      eventType: "action.requested",
      // Not yet bound to a user; the decision route will record approval/denial
      // events with the resolved vana_user_id. Schema permits null here.
      vanaUserId: null,
      idempotencyKey: `${persisted.id}:requested`,
      requestHash,
      issuer,
      now,
    }),
  );

  const baseUrl = (
    input.baseUrl ??
    input.issuer ??
    DEFAULT_ACCOUNT_ACTION_ISSUER
  ).replace(/\/+$/, "");
  // Carry raw state through the browser via the action_url query string —
  // analogous to the OAuth/OIDC `state` parameter on an authorization request.
  // The DB row only stores `state_hash`; the decision route re-receives the
  // raw value from the user agent and verifies its hash before replay.
  const stateQuery =
    state !== undefined ? `?state=${encodeURIComponent(state)}` : "";
  const actionUrl = `${baseUrl}/account/actions/${persisted.id}${stateQuery}`;

  return {
    kind: "ok",
    status: 200,
    body: {
      action_request_id: persisted.id,
      action_url: actionUrl,
      expires_at: persisted.expires_at,
      execution_mode: persisted.execution_mode,
      result_mode: persisted.result_mode,
    },
  };
}

export type ExchangeActionCodeInput = {
  body: unknown;
  registry?: OauthClientRegistry;
  consumeActionCodeWithExchangeEvent: (input: {
    presentedCode: string;
    presentingClientId: string;
    issuer?: string;
    now?: Date;
  }) => Promise<
    | { ok: true; result: ActionResultRow }
    | {
        ok: false;
        reason: "not_found" | "client_mismatch" | "expired" | "consumed";
      }
  >;
  now?: Date;
  issuer?: string;
};

export type ExchangeActionCodeResult =
  | {
      kind: "ok";
      status: 200;
      body: {
        action_request_id: string;
        result_mode: ActionResultMode;
        result_payload: Record<string, unknown> | null;
        result_reference: string | null;
        expires_at: string;
      };
    }
  | { kind: "error"; status: 400; code: string; message: string };

export async function handleExchangeActionCode(
  input: ExchangeActionCodeInput,
): Promise<ExchangeActionCodeResult> {
  if (!isStringRecord(input.body)) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const clientId = asString(input.body.client_id);
  if (!clientId) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Missing required client_id",
    };
  }

  const actionCode = asString(input.body.action_code);
  if (!actionCode) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Missing required action_code",
    };
  }

  const registry = input.registry ?? createDefaultOauthClientRegistry();
  if (!registry.resolve(clientId)) {
    // Stable OAuth-ish error; we deliberately return the same shape we'd use
    // for a hash mismatch so a guess against an unknown client is not
    // distinguishable from a guess against a wrong code.
    return {
      kind: "error",
      status: 400,
      code: "invalid_grant",
      message: "Action code is invalid or has been consumed",
    };
  }

  const outcome = await input.consumeActionCodeWithExchangeEvent({
    presentedCode: actionCode,
    presentingClientId: clientId,
    issuer: input.issuer ?? DEFAULT_ACCOUNT_ACTION_ISSUER,
    now: input.now,
  });

  if (!outcome.ok) {
    return mapExchangeFailure(outcome.reason);
  }

  const { result } = outcome;

  return {
    kind: "ok",
    status: 200,
    body: {
      action_request_id: result.action_request_id,
      result_mode: result.result_mode,
      result_payload: result.result_payload,
      result_reference: result.result_reference,
      expires_at: result.expires_at,
    },
  };
}

function mapExchangeFailure(
  reason: "not_found" | "client_mismatch" | "expired" | "consumed",
): { kind: "error"; status: 400; code: string; message: string } {
  switch (reason) {
    case "expired":
      return {
        kind: "error",
        status: 400,
        code: "expired_grant",
        message: "Action code has expired",
      };
    case "not_found":
    case "client_mismatch":
    case "consumed":
      // Fold the remaining failures into one stable error so a caller cannot
      // probe for the existence of a code by inspecting the error code.
      return {
        kind: "error",
        status: 400,
        code: "invalid_grant",
        message: "Action code is invalid or has been consumed",
      };
  }
}

export type DecisionRouteInput = {
  request: Request;
  actionRequestId: string;
  body: unknown;
  registry?: OauthClientRegistry;
  resolveVanaUserId: ResolveVanaUserId;
  findActionRequestById: (id: string) => Promise<ActionRequestRow | null>;
  /**
   * Look up the user's wallet address by vana_user_id, used to populate
   * `subject_wallet_address` on consent events.
   */
  resolveSubjectWalletAddress?: (vanaUserId: string) => Promise<string | null>;
  /**
   * Execute the protocol grant on the user's Personal Server. Required when
   * `execution_mode === "embedded_wallet_account_hosted"`. Tests inject a
   * fake; production wires {@link executeGrantViaPersonalServer}.
   */
  executeGrant?: (input: {
    vanaUserId: string;
    clientId: string;
    requestedData: RequestedData;
  }) => Promise<ExecuteGrantResult>;
  persistActionDecisionBundle: (input: {
    id: string;
    decision: "approved" | "denied";
    vanaUserId: string;
    decidedAt: string;
    result: ActionResultRow | null;
    event: ConsentEventRow;
  }) => Promise<{
    request: ActionRequestRow;
    result: ActionResultRow | null;
    event: ConsentEventRow;
  } | null>;
  now?: Date;
  issuer?: string;
};

type SuccessfulGrant = Extract<ExecuteGrantResult, { ok: true }>;

export type DecisionRouteResult =
  | {
      kind: "ok";
      status: 200;
      body: {
        action_request_id: string;
        decision: "approved" | "denied";
        redirect_url: string | null;
      };
    }
  | {
      kind: "error";
      status: 400 | 401 | 403 | 404 | 409 | 500 | 502;
      code: string;
      message: string;
    };

/**
 * Approve or deny an action request. The acting `vana_user_id` is resolved
 * from {@link LoginEvidence} via the configured resolver — never trusted from
 * request body or query.
 *
 * For first-slice mock approvals: we issue a single-use action code, persist
 * a mock result, persist an `action.approved` consent event, and return the
 * client's redirect URL with `action_code` and optional `state`. The redirect
 * URL is provided to the caller for navigation; the raw action code is
 * embedded in the redirect query and is never stored.
 *
 * For denials: we persist `action.denied` and return a redirect URL with no
 * `action_code` (and `state` if present). This is the documented denial
 * shape: clients reading the redirect see no code, must not retry, and may
 * surface the denial to the user.
 */
export async function handleActionDecision(
  input: DecisionRouteInput,
): Promise<DecisionRouteResult> {
  const vanaUserId = await input.resolveVanaUserId(input.request);
  if (!vanaUserId) {
    return {
      kind: "error",
      status: 401,
      code: "login_required",
      message: "Login evidence is required to decide an action request",
    };
  }

  if (!isVanaUserId(vanaUserId)) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_subject",
      message: "Resolved action subject must be an opaque vana_user_id",
    };
  }

  const existing = await input.findActionRequestById(input.actionRequestId);
  if (!existing) {
    return {
      kind: "error",
      status: 404,
      code: "not_found",
      message: "Action request not found",
    };
  }

  if (existing.vana_user_id !== null && existing.vana_user_id !== vanaUserId) {
    return {
      kind: "error",
      status: 403,
      code: "forbidden",
      message: "Action request belongs to a different account",
    };
  }

  if (!isStringRecord(input.body)) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const rawDecision = asString(input.body.decision);
  if (rawDecision !== "approved" && rawDecision !== "denied") {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "decision must be 'approved' or 'denied'",
    };
  }

  if (rawDecision === "approved") {
    const supportedExecutionModes: ActionExecutionMode[] = [
      "mock",
      "embedded_wallet_account_hosted",
    ];
    if (!supportedExecutionModes.includes(existing.execution_mode)) {
      return {
        kind: "error",
        status: 409,
        code: "unsupported_action_mode",
        message: `Approval flow does not support execution_mode='${existing.execution_mode}' yet`,
      };
    }
    // Only mock result_mode is supported in this slice (real result_mode
    // requires encrypted bundle delivery, tracked separately).
    if (existing.result_mode !== "mock") {
      return {
        kind: "error",
        status: 409,
        code: "unsupported_action_mode",
        message: `Approval flow does not support result_mode='${existing.result_mode}' yet`,
      };
    }
    // Real-grant execution requires an executor and a registry (to look up
    // builder identity). Reject early with a clear error if missing.
    if (
      existing.execution_mode === "embedded_wallet_account_hosted" &&
      !input.executeGrant
    ) {
      return {
        kind: "error",
        status: 500,
        code: "grant_executor_unavailable",
        message:
          "Server is misconfigured: real-grant executor not wired into the action-decision route",
      } as DecisionRouteResult;
    }
  }

  // Verify presented state against the stored hash BEFORE persisting the
  // decision, so a malformed or missing state never advances the row out of
  // `pending`.
  const presentedState = asOptionalString(input.body.state);
  if (existing.state_hash !== null) {
    if (presentedState === undefined) {
      return {
        kind: "error",
        status: 400,
        code: "invalid_request",
        message: "state is required to decide this action request",
      };
    }
    const presentedHash = crypto
      .createHash("sha256")
      .update(presentedState)
      .digest("hex");
    if (presentedHash !== existing.state_hash) {
      return {
        kind: "error",
        status: 400,
        code: "invalid_request",
        message: "state does not match the original request",
      };
    }
  } else if (presentedState !== undefined) {
    return {
      kind: "error",
      status: 400,
      code: "invalid_request",
      message: "state was not set on the original request",
    };
  }

  const now = input.now ?? new Date();

  const issuer = input.issuer ?? DEFAULT_ACCOUNT_ACTION_ISSUER;
  const requestHash = canonicalRequestHash({
    clientId: existing.client_id,
    actionType: existing.action_type,
    executionMode: existing.execution_mode,
    resultMode: existing.result_mode,
    requestedData: existing.requested_data,
    redirectUri: existing.redirect_uri,
  });

  if (rawDecision === "denied") {
    const deniedRequest: ActionRequestRow = {
      ...existing,
      status: "denied",
      vana_user_id: vanaUserId,
      decided_at: now.toISOString(),
    };
    const subjectWalletAddress = input.resolveSubjectWalletAddress
      ? await input.resolveSubjectWalletAddress(vanaUserId).catch(() => null)
      : null;
    const clientRecord = input.registry?.resolve(deniedRequest.client_id);
    const event = buildConsentEventRow({
      request: deniedRequest,
      eventType: "action.denied",
      decision: "denied",
      vanaUserId,
      subjectWalletAddress,
      applicationId: clientRecord?.protocolPrincipal?.id ?? null,
      idempotencyKey: `${deniedRequest.id}:denied`,
      requestHash,
      issuer,
      now,
    });
    const persisted = await input.persistActionDecisionBundle({
      id: existing.id,
      decision: "denied",
      vanaUserId,
      decidedAt: now.toISOString(),
      result: null,
      event,
    });
    if (!persisted) {
      return {
        kind: "error",
        status: 409,
        code: "not_pending",
        message: "Action request is no longer pending or has expired",
      };
    }
    // Denial redirect carries `state` only — never an action_code. Clients
    // reading the redirect see no code, must not retry, and may surface the
    // denial to the user.
    const denyRedirect = new URL(persisted.request.redirect_uri);
    if (presentedState !== undefined) {
      denyRedirect.searchParams.set("state", presentedState);
    }
    return {
      kind: "ok",
      status: 200,
      body: {
        action_request_id: persisted.request.id,
        decision: "denied",
        redirect_url: denyRedirect.toString(),
      },
    };
  }

  // Approved branch: precompute the result/event from the validated request,
  // then let the DB helper persist the decision and both dependent rows
  // atomically.
  const actionCode = generateActionCode();
  const approvedRequest: ActionRequestRow = {
    ...existing,
    status: "approved",
    vana_user_id: vanaUserId,
    decided_at: now.toISOString(),
  };

  let grant: SuccessfulGrant | null = null;
  if (approvedRequest.execution_mode === "embedded_wallet_account_hosted") {
    // Guarded above; assert non-null for the type system.
    const executor = input.executeGrant;
    if (!executor) {
      return {
        kind: "error",
        status: 500,
        code: "grant_executor_unavailable",
        message: "Real-grant executor missing",
      };
    }
    const grantResult = await executor({
      vanaUserId,
      clientId: approvedRequest.client_id,
      requestedData: approvedRequest.requested_data,
    });
    if (!grantResult.ok) {
      return {
        kind: "error",
        status: grantResult.code === "no_personal_server" ? 409 : 502,
        code: `grant_${grantResult.code}`,
        message: grantResult.message,
      };
    }
    grant = grantResult;
  }

  const result = grant
    ? buildAccountHostedGrantActionResult({
        request: approvedRequest,
        actionCode,
        grant,
        now,
        ttlSeconds: ACTION_CODE_TTL_SECONDS,
      })
    : buildMockActionResult({
        request: approvedRequest,
        actionCode,
        now,
        ttlSeconds: ACTION_CODE_TTL_SECONDS,
      });
  const subjectWalletAddress = input.resolveSubjectWalletAddress
    ? await input.resolveSubjectWalletAddress(vanaUserId).catch(() => null)
    : null;
  const clientRecord = input.registry?.resolve(approvedRequest.client_id);
  const event = buildConsentEventRow({
    request: approvedRequest,
    eventType: "action.approved",
    decision: "approved",
    vanaUserId,
    subjectWalletAddress,
    applicationId: clientRecord?.protocolPrincipal?.id ?? null,
    authorizationReference: grant
      ? {
          type: "personal_server_grant",
          grant_id: grant.grantId,
          grantee_address: grant.granteeAddress,
          personal_server_id: grant.personalServer.serverId,
          personal_server_url: grant.personalServer.serverUrl,
        }
      : null,
    idempotencyKey: `${approvedRequest.id}:approved`,
    requestHash,
    issuer,
    now,
  });
  const persisted = await input.persistActionDecisionBundle({
    id: existing.id,
    decision: "approved",
    vanaUserId,
    decidedAt: now.toISOString(),
    result,
    event,
  });
  if (!persisted) {
    return {
      kind: "error",
      status: 409,
      code: "not_pending",
      message: "Action request is no longer pending or has expired",
    };
  }

  const params = buildRedirectParams({
    actionCode,
    state: presentedState,
  });
  const redirect = new URL(persisted.request.redirect_uri);
  for (const [key, value] of Object.entries(params)) {
    redirect.searchParams.set(key, value);
  }

  return {
    kind: "ok",
    status: 200,
    body: {
      action_request_id: persisted.request.id,
      decision: "approved",
      redirect_url: redirect.toString(),
    },
  };
}
