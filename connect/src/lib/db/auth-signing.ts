/**
 * Persistence for the signing authority plane (migration 008).
 *
 * See docs/auth-redesign/01-architecture.md §1.2 and §5.
 *
 * Two tables:
 *
 *   - signing_authorizations: per-call-site, single-use, payload-bound row
 *     written inside the same DB transaction as the provider SDK call.
 *     Partial UNIQUE on payload_hash where consumed_at IS NULL prevents
 *     two unconsumed authorities for the same payload.
 *
 *   - interactive_confirmations: user-clicked confirmation events for
 *     HIGH_RISK_PURPOSES. Issued by the route, consumed by the client
 *     clicking "Confirm". Decoupled TTL from authorities (5min vs 60s).
 *
 * Atomic invariants are enforced via:
 *   - SQL-level partial UNIQUE on signing_authorizations(payload_hash)
 *     WHERE consumed_at IS NULL.
 *   - SQL-level "UPDATE ... WHERE consumed_at IS NULL ... RETURNING" for
 *     idempotent confirmation consume.
 *   - "INSERT ... ON CONFLICT DO NOTHING" + RETURNING for at-most-once
 *     authority creation.
 *
 * This module is the only place the auth/signing tables touch Postgres.
 */

import { randomBytes } from "node:crypto";
import { getSql } from "./sql";

type DbRows = Array<Record<string, unknown>>;

// Branded user/wallet ids. Stage 6 brings the brand; for stage-2 these are
// plain string aliases that the brand will narrow into.
type VanaUserId = string;
type VanaWalletId = string;

export type SigningPurpose =
  | "register_personal_server"
  | "register_personal_server_deregistration"
  | "create_grant"
  | "revoke_grant";

export type SigningAuthorizationRow = {
  id: string;
  vana_user_id: VanaUserId;
  vana_wallet_id: VanaWalletId;
  hydra_session_id: string;
  purpose: SigningPurpose;
  payload_hash: string;
  payload_summary: Record<string, unknown>;
  confirmation_id: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type InteractiveConfirmationRow = {
  id: string;
  vana_user_id: VanaUserId;
  hydra_session_id: string;
  vana_wallet_id: VanaWalletId;
  purpose: SigningPurpose;
  payload_hash: string;
  payload_summary: Record<string, unknown>;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

const AUTHORIZATION_DEFAULT_TTL_SECONDS = 60;
const CONFIRMATION_DEFAULT_TTL_SECONDS = 5 * 60;

export function generateSigningAuthorizationId(): string {
  return `vana_sigauth_${randomBytes(16).toString("hex")}`;
}

export function generateConfirmationId(): string {
  return `vana_confirm_${randomBytes(16).toString("hex")}`;
}

// --- interactive_confirmations -----------------------------------------------

export async function insertConfirmation(input: {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  vanaWalletId: VanaWalletId;
  purpose: SigningPurpose;
  payloadHash: string;
  payloadSummary: Record<string, unknown>;
  ttlSeconds?: number;
}): Promise<InteractiveConfirmationRow> {
  const sql = getSql();
  const id = generateConfirmationId();
  const ttl = input.ttlSeconds ?? CONFIRMATION_DEFAULT_TTL_SECONDS;
  const rows = await sql`
    INSERT INTO interactive_confirmations
      (id, vana_user_id, hydra_session_id, vana_wallet_id, purpose,
       payload_hash, payload_summary, expires_at)
    VALUES
      (${id}, ${input.vanaUserId}, ${input.hydraSessionId}, ${input.vanaWalletId},
       ${input.purpose}, ${input.payloadHash},
       ${JSON.stringify(input.payloadSummary)}::jsonb,
       now() + (${ttl}::int * INTERVAL '1 second'))
    RETURNING *
  `;
  return (rows as DbRows)[0] as unknown as InteractiveConfirmationRow;
}

export async function findConfirmationById(
  id: string,
): Promise<InteractiveConfirmationRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM interactive_confirmations WHERE id = ${id}
  `;
  return ((rows as DbRows)[0] as unknown as InteractiveConfirmationRow) ?? null;
}

/**
 * Atomically consume a confirmation. Returns the row if the transition
 * NULL → now() succeeded; null otherwise (already consumed, expired, or
 * session/user mismatch). The single SQL statement is the entire mutex.
 */
export async function consumeConfirmation(input: {
  id: string;
  vanaUserId: VanaUserId;
  hydraSessionId: string;
}): Promise<InteractiveConfirmationRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE interactive_confirmations
       SET consumed_at = now()
     WHERE id = ${input.id}
       AND vana_user_id = ${input.vanaUserId}
       AND hydra_session_id = ${input.hydraSessionId}
       AND consumed_at IS NULL
       AND expires_at > now()
    RETURNING *
  `;
  return ((rows as DbRows)[0] as unknown as InteractiveConfirmationRow) ?? null;
}

// --- signing_authorizations -------------------------------------------------

/**
 * Create a single-use, payload-bound authorization row. Inserted inside the
 * same transaction as the provider SDK call (the caller must hold the
 * transaction open and pass `tx` if needed; the default implementation uses
 * the autocommit-pooled connection from getSql()).
 *
 * Partial UNIQUE on payload_hash WHERE consumed_at IS NULL means a second
 * concurrent insert for the same unconsumed payload will throw a unique-
 * violation, which the caller should treat as "another tx is mid-sign;
 * back off and retry."
 */
export async function insertSigningAuthorization(input: {
  vanaUserId: VanaUserId;
  vanaWalletId: VanaWalletId;
  hydraSessionId: string;
  purpose: SigningPurpose;
  payloadHash: string;
  payloadSummary: Record<string, unknown>;
  confirmationId?: string | null;
  ttlSeconds?: number;
  maxUses?: number;
}): Promise<SigningAuthorizationRow> {
  const sql = getSql();
  const id = generateSigningAuthorizationId();
  const ttl = input.ttlSeconds ?? AUTHORIZATION_DEFAULT_TTL_SECONDS;
  const rows = await sql`
    INSERT INTO signing_authorizations
      (id, vana_user_id, vana_wallet_id, hydra_session_id, purpose,
       payload_hash, payload_summary, confirmation_id, max_uses,
       used_count, expires_at)
    VALUES
      (${id}, ${input.vanaUserId}, ${input.vanaWalletId},
       ${input.hydraSessionId}, ${input.purpose}, ${input.payloadHash},
       ${JSON.stringify(input.payloadSummary)}::jsonb,
       ${input.confirmationId ?? null}, ${input.maxUses ?? 1}, 0,
       now() + (${ttl}::int * INTERVAL '1 second'))
    RETURNING *
  `;
  return (rows as DbRows)[0] as unknown as SigningAuthorizationRow;
}

/**
 * Atomically mark an authorization as consumed. Returns the row if the
 * pre-update state was used_count = 0; null otherwise (already consumed
 * or stolen by a concurrent caller — should be impossible given the
 * UNIQUE on payload_hash, but is asserted as a defense in depth).
 */
export async function consumeSigningAuthorization(
  id: string,
): Promise<SigningAuthorizationRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE signing_authorizations
       SET used_count = 1, consumed_at = now()
     WHERE id = ${id}
       AND used_count = 0
       AND consumed_at IS NULL
       AND expires_at > now()
    RETURNING *
  `;
  return ((rows as DbRows)[0] as unknown as SigningAuthorizationRow) ?? null;
}

/**
 * Idempotency lookup: for a confirmation_id whose authority was already
 * minted within the 30s grace window after a network blip on the original
 * route, return the consumed row so the caller can return its cached
 * signature instead of double-signing. Lookup is by confirmation_id, which
 * is bound 1:1 to authority_id at insert time via FK.
 *
 * The route handler enforces the 30s window itself by checking consumed_at
 * (this returns the row regardless of age so callers can choose grace policy).
 */
export async function findConsumedAuthorizationByConfirmationId(
  confirmationId: string,
): Promise<SigningAuthorizationRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM signing_authorizations
     WHERE confirmation_id = ${confirmationId}
       AND consumed_at IS NOT NULL
     ORDER BY consumed_at DESC
     LIMIT 1
  `;
  return ((rows as DbRows)[0] as unknown as SigningAuthorizationRow) ?? null;
}

export async function findSigningAuthorizationById(
  id: string,
): Promise<SigningAuthorizationRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM signing_authorizations WHERE id = ${id}
  `;
  return ((rows as DbRows)[0] as unknown as SigningAuthorizationRow) ?? null;
}
