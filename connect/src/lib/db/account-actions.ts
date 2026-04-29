import { neon } from "@neondatabase/serverless";
import {
  type ActionRequestRow,
  type ActionResultRow,
  type ConsentEventRow,
  generateConsentEventId,
  hashActionCode,
} from "../auth/account-action";

/**
 * Persistence helpers for account-hosted action requests, results, and
 * consent events (design.md D6/D7/D10/D11).
 *
 * Mirrors the direct-Neon-SQL style used in `./account.ts` and `./neon.ts`.
 * The pure model helpers in `../auth/account-action.ts` produce row-shaped
 * objects; this module is the only place those rows touch Postgres.
 *
 * The atomic action-code consumption in {@link consumeActionCode} is the
 * production-safe complement to the in-memory `validateActionCodeExchange`
 * helper. It performs hash-match, client-binding, expiry, and not-yet-consumed
 * checks as predicates inside a single `UPDATE ... RETURNING` so two
 * concurrent exchanges of the same code can never both succeed: at most one
 * statement can transition `consumed_at` from NULL to non-NULL.
 *
 * Raw action codes are never written to the database. Callers must pass the
 * raw code; this module hashes it before any SQL executes.
 */

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(url);
}

function jsonOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function rowToActionRequest(row: Record<string, unknown>): ActionRequestRow {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    vana_user_id: (row.vana_user_id as string | null) ?? null,
    action_type: row.action_type as string,
    execution_mode: row.execution_mode as ActionRequestRow["execution_mode"],
    result_mode: row.result_mode as ActionRequestRow["result_mode"],
    requested_data: row.requested_data as ActionRequestRow["requested_data"],
    redirect_uri: row.redirect_uri as string,
    state_hash: (row.state_hash as string | null) ?? null,
    status: row.status as ActionRequestRow["status"],
    display_metadata:
      (row.display_metadata as ActionRequestRow["display_metadata"]) ?? null,
    created_at: toIsoString(row.created_at),
    expires_at: toIsoString(row.expires_at),
    decided_at: row.decided_at ? toIsoString(row.decided_at) : null,
  };
}

function rowToActionResult(row: Record<string, unknown>): ActionResultRow {
  return {
    id: row.id as string,
    action_request_id: row.action_request_id as string,
    client_id: row.client_id as string,
    action_code_hash: row.action_code_hash as string,
    result_mode: row.result_mode as ActionResultRow["result_mode"],
    result_payload:
      (row.result_payload as ActionResultRow["result_payload"]) ?? null,
    result_reference: (row.result_reference as string | null) ?? null,
    created_at: toIsoString(row.created_at),
    expires_at: toIsoString(row.expires_at),
    consumed_at: row.consumed_at ? toIsoString(row.consumed_at) : null,
  };
}

function rowToConsentEvent(row: Record<string, unknown>): ConsentEventRow {
  return {
    id: row.id as string,
    schema_version: Number(row.schema_version),
    event_type: row.event_type as ConsentEventRow["event_type"],
    occurred_at: toIsoString(row.occurred_at),
    issuer: row.issuer as string,
    vana_user_id: (row.vana_user_id as string | null) ?? null,
    subject_wallet_address:
      (row.subject_wallet_address as string | null) ?? null,
    client_id: row.client_id as string,
    application_id: (row.application_id as string | null) ?? null,
    protocol_principal:
      (row.protocol_principal as Record<string, unknown> | null) ?? null,
    action_request_id: (row.action_request_id as string | null) ?? null,
    action_type: row.action_type as string,
    requested_data: row.requested_data as ConsentEventRow["requested_data"],
    decision: (row.decision as ConsentEventRow["decision"]) ?? null,
    execution_mode: row.execution_mode as ConsentEventRow["execution_mode"],
    result_mode: row.result_mode as ConsentEventRow["result_mode"],
    authorization_reference:
      (row.authorization_reference as Record<string, unknown> | null) ?? null,
    idempotency_key: row.idempotency_key as string,
    request_hash: row.request_hash as string,
    audit_metadata:
      (row.audit_metadata as Record<string, unknown> | null) ?? null,
  };
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  throw new Error(`account-actions: cannot coerce ${typeof value} to ISO date`);
}

export async function insertActionRequest(
  row: ActionRequestRow,
): Promise<ActionRequestRow> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO account_action_requests (
      id, client_id, vana_user_id, action_type, execution_mode, result_mode,
      requested_data, redirect_uri, state_hash, status, display_metadata,
      created_at, expires_at, decided_at
    ) VALUES (
      ${row.id}, ${row.client_id}, ${row.vana_user_id}, ${row.action_type},
      ${row.execution_mode}, ${row.result_mode},
      ${JSON.stringify(row.requested_data)}::jsonb,
      ${row.redirect_uri}, ${row.state_hash}, ${row.status},
      ${jsonOrNull(row.display_metadata)}::jsonb,
      ${row.created_at}, ${row.expires_at}, ${row.decided_at}
    )
    RETURNING *
  `;
  return rowToActionRequest(rows[0] as Record<string, unknown>);
}

export async function findActionRequestById(
  id: string,
): Promise<ActionRequestRow | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM account_action_requests WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToActionRequest(rows[0] as Record<string, unknown>);
}

/**
 * Persist an approve/deny decision for a pending request. The transition is
 * gated by `status = 'pending'` so a second decision cannot overwrite the
 * first. Returns null if the row was already non-pending or did not exist.
 */
export async function persistActionRequestDecision(input: {
  id: string;
  decision: "approved" | "denied";
  vanaUserId: string;
  decidedAt: string;
}): Promise<ActionRequestRow | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE account_action_requests
    SET
      status = ${input.decision},
      vana_user_id = ${input.vanaUserId},
      decided_at = ${input.decidedAt}
    WHERE id = ${input.id}
      AND status = 'pending'
      AND expires_at > now()
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToActionRequest(rows[0] as Record<string, unknown>);
}

export type PersistActionDecisionBundleInput = {
  id: string;
  decision: "approved" | "denied";
  vanaUserId: string;
  decidedAt: string;
  result: ActionResultRow | null;
  event: ConsentEventRow;
};

export type PersistActionDecisionBundleOutcome = {
  request: ActionRequestRow;
  result: ActionResultRow | null;
  event: ConsentEventRow;
};

/**
 * Persist the user decision and its dependent artifact rows in one statement.
 *
 * A route must not be able to leave a request in `approved` without the action
 * result/code row, or in `denied` without the audit event. The CTE gates the
 * state transition on `pending` + unexpired, then inserts result/event rows
 * only from the updated request row. If any insert fails, Postgres rolls the
 * whole statement back.
 */
export async function persistActionDecisionBundle(
  input: PersistActionDecisionBundleInput,
): Promise<PersistActionDecisionBundleOutcome | null> {
  if (input.decision === "approved" && input.result === null) {
    throw new Error(
      "persistActionDecisionBundle: approved decisions need a result",
    );
  }
  if (input.decision === "denied" && input.result !== null) {
    throw new Error(
      "persistActionDecisionBundle: denied decisions cannot include a result",
    );
  }

  const sql = getSQL();
  const result = input.result;
  const hasResult = result !== null;
  const rows = await sql`
    WITH updated AS (
      UPDATE account_action_requests
      SET
        status = ${input.decision},
        vana_user_id = ${input.vanaUserId},
        decided_at = ${input.decidedAt}
      WHERE id = ${input.id}
        AND status = 'pending'
        AND expires_at > now()
      RETURNING *
    ),
    inserted_result AS (
      INSERT INTO account_action_results (
        id, action_request_id, client_id, action_code_hash, result_mode,
        result_payload, result_reference, created_at, expires_at, consumed_at
      )
      SELECT
        ${result?.id ?? null},
        updated.id,
        updated.client_id,
        ${result?.action_code_hash ?? null},
        ${result?.result_mode ?? null},
        ${jsonOrNull(result?.result_payload)}::jsonb,
        ${result?.result_reference ?? null},
        ${result?.created_at ?? null},
        ${result?.expires_at ?? null},
        ${result?.consumed_at ?? null}
      FROM updated
      WHERE ${hasResult}::boolean
      RETURNING *
    ),
    inserted_event AS (
      INSERT INTO account_consent_events (
        id, schema_version, event_type, occurred_at, issuer,
        vana_user_id, subject_wallet_address, client_id, application_id,
        protocol_principal, action_request_id, action_type, requested_data,
        decision, execution_mode, result_mode, authorization_reference,
        idempotency_key, request_hash, audit_metadata
      )
      SELECT
        ${input.event.id},
        ${input.event.schema_version},
        ${input.event.event_type},
        ${input.event.occurred_at},
        ${input.event.issuer},
        ${input.vanaUserId},
        ${input.event.subject_wallet_address},
        updated.client_id,
        ${input.event.application_id},
        ${jsonOrNull(input.event.protocol_principal)}::jsonb,
        updated.id,
        updated.action_type,
        updated.requested_data,
        ${input.event.decision},
        updated.execution_mode,
        updated.result_mode,
        ${jsonOrNull(input.event.authorization_reference)}::jsonb,
        ${input.event.idempotency_key},
        ${input.event.request_hash},
        ${jsonOrNull(input.event.audit_metadata)}::jsonb
      FROM updated
      RETURNING *
    )
    SELECT
      to_jsonb(updated) AS request,
      (SELECT to_jsonb(inserted_result) FROM inserted_result LIMIT 1) AS result,
      (SELECT to_jsonb(inserted_event) FROM inserted_event LIMIT 1) AS event
    FROM updated
  `;

  if (rows.length === 0) return null;
  const row = rows[0] as {
    request: Record<string, unknown>;
    result: Record<string, unknown> | null;
    event: Record<string, unknown>;
  };
  return {
    request: rowToActionRequest(row.request),
    result: row.result ? rowToActionResult(row.result) : null,
    event: rowToConsentEvent(row.event),
  };
}

export async function insertActionResult(
  row: ActionResultRow,
): Promise<ActionResultRow> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO account_action_results (
      id, action_request_id, client_id, action_code_hash, result_mode,
      result_payload, result_reference, created_at, expires_at, consumed_at
    ) VALUES (
      ${row.id}, ${row.action_request_id}, ${row.client_id},
      ${row.action_code_hash}, ${row.result_mode},
      ${jsonOrNull(row.result_payload)}::jsonb,
      ${row.result_reference},
      ${row.created_at}, ${row.expires_at}, ${row.consumed_at}
    )
    RETURNING *
  `;
  return rowToActionResult(rows[0] as Record<string, unknown>);
}

export async function insertConsentEvent(
  row: ConsentEventRow,
): Promise<ConsentEventRow> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO account_consent_events (
      id, schema_version, event_type, occurred_at, issuer,
      vana_user_id, subject_wallet_address, client_id, application_id,
      protocol_principal, action_request_id, action_type, requested_data,
      decision, execution_mode, result_mode, authorization_reference,
      idempotency_key, request_hash, audit_metadata
    ) VALUES (
      ${row.id}, ${row.schema_version}, ${row.event_type}, ${row.occurred_at},
      ${row.issuer},
      ${row.vana_user_id}, ${row.subject_wallet_address}, ${row.client_id},
      ${row.application_id},
      ${jsonOrNull(row.protocol_principal)}::jsonb,
      ${row.action_request_id}, ${row.action_type},
      ${JSON.stringify(row.requested_data)}::jsonb,
      ${row.decision}, ${row.execution_mode}, ${row.result_mode},
      ${jsonOrNull(row.authorization_reference)}::jsonb,
      ${row.idempotency_key}, ${row.request_hash},
      ${jsonOrNull(row.audit_metadata)}::jsonb
    )
    RETURNING *
  `;
  return rowToConsentEvent(rows[0] as Record<string, unknown>);
}

export type ConsumeActionCodeFailure =
  | "not_found"
  | "client_mismatch"
  | "expired"
  | "consumed";

export type ConsumeActionCodeOutcome =
  | { ok: true; result: ActionResultRow }
  | { ok: false; reason: ConsumeActionCodeFailure };

/**
 * Atomically consume an action code for the presenting client.
 *
 * The hot path is a single `UPDATE ... RETURNING` whose WHERE clause matches:
 *
 *   - the row whose `action_code_hash` equals `sha256(presentedCode)`,
 *   - whose `client_id` equals `presentingClientId`,
 *   - whose `consumed_at IS NULL`,
 *   - whose `expires_at > now()`,
 *
 * and which sets `consumed_at = now()` and returns the row. If the update
 * affects 1 row, the caller is the sole successful consumer of that code:
 * Postgres serializes concurrent updates against the same row, so a second
 * caller will see `consumed_at IS NOT NULL` and the WHERE clause will not
 * match.
 *
 * If the update affects 0 rows, a follow-up SELECT distinguishes the failure
 * reason for the caller. The follow-up is informational only; it never
 * reverses or shadows the atomic consume.
 */
export async function consumeActionCode(input: {
  presentedCode: string;
  presentingClientId: string;
}): Promise<ConsumeActionCodeOutcome> {
  const sql = getSQL();
  const presentedHash = hashActionCode(input.presentedCode);

  const updated = await sql`
    UPDATE account_action_results
    SET consumed_at = now()
    WHERE action_code_hash = ${presentedHash}
      AND client_id = ${input.presentingClientId}
      AND consumed_at IS NULL
      AND expires_at > now()
    RETURNING *
  `;

  if (updated.length > 0) {
    return {
      ok: true,
      result: rowToActionResult(updated[0] as Record<string, unknown>),
    };
  }

  // Diagnose why nothing was updated. We deliberately look up by hash only —
  // if the hash itself does not match a row, the presented code is unknown.
  const probe = await sql`
    SELECT client_id, consumed_at, expires_at
    FROM account_action_results
    WHERE action_code_hash = ${presentedHash}
    LIMIT 1
  `;
  if (probe.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  const row = probe[0] as {
    client_id: string;
    consumed_at: string | Date | null;
    expires_at: string | Date;
  };
  if (row.client_id !== input.presentingClientId) {
    return { ok: false, reason: "client_mismatch" };
  }
  if (row.consumed_at !== null) {
    return { ok: false, reason: "consumed" };
  }
  // Remaining case: expired (covered by the `expires_at > now()` predicate).
  return { ok: false, reason: "expired" };
}

export async function consumeActionCodeWithExchangeEvent(input: {
  presentedCode: string;
  presentingClientId: string;
  issuer?: string;
  now?: Date;
}): Promise<ConsumeActionCodeOutcome> {
  const sql = getSQL();
  const presentedHash = hashActionCode(input.presentedCode);
  const occurredAt = (input.now ?? new Date()).toISOString();
  const issuer = input.issuer ?? "https://account.vana.org";
  const eventId = generateConsentEventId();

  const rows = await sql`
    WITH eligible AS (
      SELECT
        result.id,
        event_hash.request_hash
      FROM account_action_results result
      JOIN account_action_requests request
        ON request.id = result.action_request_id
      JOIN LATERAL (
        SELECT request_hash
        FROM account_consent_events
        WHERE action_request_id = request.id
          AND event_type IN ('action.approved', 'action.requested')
        ORDER BY
          CASE WHEN event_type = 'action.approved' THEN 0 ELSE 1 END,
          occurred_at DESC
        LIMIT 1
      ) event_hash ON TRUE
      WHERE result.action_code_hash = ${presentedHash}
        AND result.client_id = ${input.presentingClientId}
        AND result.consumed_at IS NULL
        AND result.expires_at > ${occurredAt}
    ),
    updated AS (
      UPDATE account_action_results
      SET consumed_at = ${occurredAt}
      FROM eligible
      WHERE account_action_results.id = eligible.id
      RETURNING account_action_results.*, eligible.request_hash
    ),
    request_context AS (
      SELECT
        request.*,
        updated.request_hash
      FROM account_action_requests request
      JOIN updated ON updated.action_request_id = request.id
    ),
    inserted_event AS (
      INSERT INTO account_consent_events (
        id, schema_version, event_type, occurred_at, issuer,
        vana_user_id, subject_wallet_address, client_id, application_id,
        protocol_principal, action_request_id, action_type, requested_data,
        decision, execution_mode, result_mode, authorization_reference,
        idempotency_key, request_hash, audit_metadata
      )
      SELECT
        ${eventId},
        1,
        'action.exchanged',
        ${occurredAt},
        ${issuer},
        request_context.vana_user_id,
        NULL,
        request_context.client_id,
        NULL,
        NULL::jsonb,
        request_context.id,
        request_context.action_type,
        request_context.requested_data,
        NULL,
        request_context.execution_mode,
        request_context.result_mode,
        NULL::jsonb,
        request_context.id || ':exchanged',
        request_context.request_hash,
        NULL::jsonb
      FROM request_context
      RETURNING *
    )
    SELECT
      to_jsonb(updated) AS result,
      (SELECT count(*) FROM inserted_event) AS inserted_event_count
    FROM updated
  `;

  if (rows.length > 0) {
    const row = rows[0] as { result: Record<string, unknown> };
    return { ok: true, result: rowToActionResult(row.result) };
  }

  const probeRows = await sql`
    SELECT
      result.client_id,
      result.consumed_at,
      result.expires_at,
      EXISTS (
        SELECT 1
        FROM account_consent_events event
        WHERE event.action_request_id = result.action_request_id
          AND event.event_type IN ('action.approved', 'action.requested')
      ) AS has_request_hash
    FROM account_action_results result
    WHERE result.action_code_hash = ${presentedHash}
    LIMIT 1
  `;
  if (probeRows.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  const probe = probeRows[0] as {
    client_id: string;
    consumed_at: string | Date | null;
    expires_at: string | Date;
    has_request_hash: boolean;
  };
  if (probe.client_id !== input.presentingClientId) {
    return { ok: false, reason: "client_mismatch" };
  }
  if (probe.consumed_at !== null) {
    return { ok: false, reason: "consumed" };
  }
  if (Date.parse(toIsoString(probe.expires_at)) <= Date.parse(occurredAt)) {
    return { ok: false, reason: "expired" };
  }
  if (!probe.has_request_hash) {
    throw new Error(
      "consumeActionCodeWithExchangeEvent: cannot consume without a prior request_hash event",
    );
  }
  throw new Error(
    "consumeActionCodeWithExchangeEvent: consume failed without a diagnosable reason",
  );
}

export async function findActionResultById(
  id: string,
): Promise<ActionResultRow | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM account_action_results WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToActionResult(rows[0] as Record<string, unknown>);
}

export async function findConsentEventById(
  id: string,
): Promise<ConsentEventRow | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM account_consent_events WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToConsentEvent(rows[0] as Record<string, unknown>);
}
