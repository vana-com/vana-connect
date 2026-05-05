/**
 * Persistence for the Vana session token plane (migration 008).
 *
 * See docs/auth-redesign/01-architecture.md §1.7 (token format) and §7.4
 * (logout sequence).
 *
 * Two tables:
 *
 *   - vana_refresh_tokens: encrypted-at-rest refresh tokens. Stored
 *     ciphertext + IV + GCM tag per row. KEK = REFRESH_TOKEN_ENC_KEY,
 *     a 32-byte base64 env var DISTINCT from PRIVY_SIGNER_PRIVATE_KEY.
 *     Family-tracked: rotated tokens share family_id; if a previously-
 *     rotated token is presented, the entire family is revoked.
 *
 *   - vana_session_tombstones: multi-lambda revocation. Inserted FIRST
 *     during logout (fail-closed); checked on every introspection cache
 *     hit so revocation propagates within ≤5s.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSql } from "./sql";

type DbRows = Array<Record<string, unknown>>;

type VanaUserId = string;

const KEK_ENV_VAR = "REFRESH_TOKEN_ENC_KEY";
const KEK_ENV_VAR_OLD = "REFRESH_TOKEN_ENC_KEY_OLD"; // optional; supports rotation
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKek(envVar: string): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `${envVar} must be a 32-byte base64-encoded key (got ${buf.length} bytes)`,
    );
  }
  return buf;
}

function requireKek(): Buffer {
  const kek = loadKek(KEK_ENV_VAR);
  if (!kek) {
    throw new Error(`Missing required env var: ${KEK_ENV_VAR}`);
  }
  return kek;
}

function encryptRefreshToken(plaintext: string): {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
} {
  const kek = requireKek();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, kek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_BYTES) {
    throw new Error(`AES-GCM tag length mismatch: ${tag.length}`);
  }
  return { ciphertext, iv, tag };
}

function decryptRefreshTokenWithKek(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
  kek: Buffer,
): string {
  const decipher = createDecipheriv(ALGORITHM, kek, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Decrypt with the current KEK; if that fails (e.g. during rotation), fall
 * back to the old KEK. Callers MAY re-encrypt with the new KEK after a
 * successful old-KEK decrypt to migrate the row, but that is out of scope
 * for the hot path.
 */
function decryptRefreshToken(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
): string {
  const kek = requireKek();
  try {
    return decryptRefreshTokenWithKek(ciphertext, iv, tag, kek);
  } catch (err) {
    const oldKek = loadKek(KEK_ENV_VAR_OLD);
    if (!oldKek) throw err;
    return decryptRefreshTokenWithKek(ciphertext, iv, tag, oldKek);
  }
}

export type RefreshTokenRow = {
  id: string;
  vana_user_id: VanaUserId;
  hydra_session_id: string;
  family_id: string;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function generateRefreshTokenId(): string {
  return `vana_rt_${randomBytes(16).toString("hex")}`;
}

function generateFamilyId(): string {
  return `vana_rtfam_${randomBytes(16).toString("hex")}`;
}

export async function insertRefreshToken(input: {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  refreshToken: string;
  familyId?: string;
  expiresAt: Date;
}): Promise<RefreshTokenRow> {
  const sql = getSql();
  const id = generateRefreshTokenId();
  const familyId = input.familyId ?? generateFamilyId();
  const { ciphertext, iv, tag } = encryptRefreshToken(input.refreshToken);
  const rows = await sql`
    INSERT INTO vana_refresh_tokens
      (id, vana_user_id, hydra_session_id, refresh_token_enc, iv, auth_tag,
       family_id, expires_at)
    VALUES
      (${id}, ${input.vanaUserId}, ${input.hydraSessionId}, ${ciphertext},
       ${iv}, ${tag}, ${familyId}, ${input.expiresAt.toISOString()})
    RETURNING id, vana_user_id, hydra_session_id, family_id, expires_at,
              rotated_at, revoked_at, created_at
  `;
  return (rows as DbRows)[0] as unknown as RefreshTokenRow;
}

/**
 * Look up a row by ciphertext-derived id. Used during refresh: the client
 * presents the raw token, the server decrypts each candidate row to compare;
 * for performance, the raw token is stored hashed for lookup. (Implementation
 * detail: we add a `token_hash` column in a follow-up if needed; for v1 we
 * key by id and pass the id alongside the raw token via the refresh response
 * envelope. Hydra round-trip already validates the raw token, so the DB
 * lookup is by id only.)
 *
 * For now: the caller has the row id (returned at insert) and the raw token.
 * Refresh flow goes:
 *   1. Client → Hydra /oauth2/token with raw refresh_token.
 *   2. Hydra validates and returns new tokens.
 *   3. Server marks old row rotated_at = now(), inserts new row with same
 *      family_id.
 */
export async function markRefreshTokenRotated(
  id: string,
): Promise<RefreshTokenRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE vana_refresh_tokens
       SET rotated_at = now()
     WHERE id = ${id}
       AND rotated_at IS NULL
       AND revoked_at IS NULL
    RETURNING id, vana_user_id, hydra_session_id, family_id, expires_at,
              rotated_at, revoked_at, created_at
  `;
  return ((rows as DbRows)[0] as unknown as RefreshTokenRow) ?? null;
}

/**
 * Revoke an entire token family. Called when a previously-rotated token
 * is presented (RFC 6749 §6 reuse detection): every token in the family
 * is now untrusted, so the session is dead.
 */
export async function revokeRefreshTokenFamily(
  familyId: string,
): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    UPDATE vana_refresh_tokens
       SET revoked_at = now()
     WHERE family_id = ${familyId}
       AND revoked_at IS NULL
    RETURNING id
  `;
  return (rows as DbRows).length;
}

export async function revokeRefreshTokensForSession(
  hydraSessionId: string,
): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    UPDATE vana_refresh_tokens
       SET revoked_at = now()
     WHERE hydra_session_id = ${hydraSessionId}
       AND revoked_at IS NULL
    RETURNING id
  `;
  return (rows as DbRows).length;
}

// --- vana_session_tombstones ------------------------------------------------

export type TombstoneRow = {
  hydra_session_id: string;
  vana_user_id: VanaUserId;
  revoked_at: string;
  expires_at: string;
};

const TOMBSTONE_DEFAULT_TTL_SECONDS = 30 * 60; // 30 min, exceeds 15 min access TTL

/**
 * Insert a tombstone for a Hydra session. Idempotent (PK on hydra_session_id).
 * This is the FIRST step of logout: if subsequent steps (Hydra revoke,
 * end-session) fail, the tombstone alone still rejects future requests
 * within ≤30s (the introspection cache TTL).
 */
export async function insertTombstone(input: {
  hydraSessionId: string;
  vanaUserId: VanaUserId;
  ttlSeconds?: number;
}): Promise<TombstoneRow> {
  const sql = getSql();
  const ttl = input.ttlSeconds ?? TOMBSTONE_DEFAULT_TTL_SECONDS;
  const rows = await sql`
    INSERT INTO vana_session_tombstones (hydra_session_id, vana_user_id, expires_at)
    VALUES
      (${input.hydraSessionId}, ${input.vanaUserId},
       now() + (${ttl}::int * INTERVAL '1 second'))
    ON CONFLICT (hydra_session_id) DO UPDATE
      SET revoked_at = now(),
          expires_at = EXCLUDED.expires_at
    RETURNING *
  `;
  return (rows as DbRows)[0] as unknown as TombstoneRow;
}

/**
 * Tombstone check. Called by getVanaSession() on every introspection cache
 * hit to ensure logout takes effect across lambdas. Returns true if the
 * session is tombstoned (not yet expired).
 */
export async function isSessionTombstoned(
  hydraSessionId: string,
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM vana_session_tombstones
     WHERE hydra_session_id = ${hydraSessionId}
       AND expires_at > now()
     LIMIT 1
  `;
  return (rows as DbRows).length > 0;
}

/**
 * Maintenance: GC expired tombstones. Run from a cron job; not in the hot
 * path. After 30min the access token has itself expired so the tombstone
 * is no longer load-bearing.
 */
export async function gcExpiredTombstones(): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM vana_session_tombstones
     WHERE expires_at <= now()
    RETURNING hydra_session_id
  `;
  return (rows as DbRows).length;
}

// --- vana_active_sessions ---------------------------------------------------

/**
 * Active OIDC sessions, keyed by sha256(access_token). Captures the `sid`
 * claim from the id_token at login so the session verifier can resolve a
 * stable hydra session id on every introspection without trusting the client.
 *
 * Hydra v2 introspection (RFC 7662) does not expose `sid`, so we persist it
 * here. See migration 009_active_sessions.sql.
 */

export type ActiveSessionRow = {
  sid: string;
  vanaUserId: VanaUserId;
  expiresAt: Date;
};

export async function insertActiveSession(input: {
  tokenHash: string;
  sid: string;
  vanaUserId: VanaUserId;
  expiresAt: Date;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO vana_active_sessions
      (token_hash, sid, vana_user_id, expires_at)
    VALUES
      (${input.tokenHash}, ${input.sid}, ${input.vanaUserId},
       ${input.expiresAt.toISOString()})
    ON CONFLICT (token_hash) DO NOTHING
  `;
}

export async function findActiveSessionByTokenHash(
  tokenHash: string,
): Promise<ActiveSessionRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT sid, vana_user_id, expires_at
      FROM vana_active_sessions
     WHERE token_hash = ${tokenHash}
     LIMIT 1
  `;
  const row = (rows as DbRows)[0];
  if (!row) return null;
  return {
    sid: row.sid as string,
    vanaUserId: row.vana_user_id as VanaUserId,
    expiresAt: new Date(row.expires_at as string),
  };
}

export async function deleteActiveSessionsBySid(sid: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM vana_active_sessions
     WHERE sid = ${sid}
    RETURNING id
  `;
  return (rows as DbRows).length;
}

export async function deleteExpiredActiveSessions(): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM vana_active_sessions
     WHERE expires_at <= now()
    RETURNING id
  `;
  return (rows as DbRows).length;
}

// Test-only helper, exported for unit tests.
export const __testing__ = {
  encryptRefreshToken,
  decryptRefreshToken,
};
