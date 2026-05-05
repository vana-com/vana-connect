## 2. Schema (DDL + Repository Functions)

This section is the concrete schema delta for the auth & custody redesign. All new tables ship in a single migration, `008_signing_auth_plane.sql`. The table layouts encode the two invariants from §1.1 (Provider Containment, Signing Authority) into structure: the `vana_user_id` is the only canonical user identifier on every row; signing operations are mediated by a payload-bound, single-use `signing_authorizations` row issued just-in-time at the call site.

Repository functions live in two files alongside the existing `src/lib/db/account.ts`:

- `src/lib/db/auth-signing.ts` — `signing_authorizations`, `interactive_confirmations`.
- `src/lib/db/sessions.ts` — `vana_session_tombstones`, `vana_refresh_tokens`.

Style follows `src/lib/db/account.ts` (direct `neon`-tagged-template SQL, branded types from `src/lib/auth/vana-account.ts`). No ORM. Column names are snake_case in SQL; row types preserve snake_case to match the `LinkedWalletRow` / `VanaUserRow` precedent.

Branded types referenced below (created by Stage 6 but used here in signatures):

```typescript
// src/lib/auth/vana-account.ts (additions)
export type VanaUserId = string & { readonly __brand: "VanaUserId" };
export type VanaWalletId = string & { readonly __brand: "VanaWalletId" };
export type HydraSessionId = string & { readonly __brand: "HydraSessionId" };

export function assertVanaUserId(v: string): asserts v is VanaUserId {
  /* runtime regex */
}
export function assertVanaWalletId(v: string): asserts v is VanaWalletId {
  /* runtime regex */
}
export function assertHydraSessionId(v: string): asserts v is HydraSessionId {
  /* runtime regex */
}
```

The `Purpose` type is the closed enum (§2.6).

---

### 2.1 `signing_authorizations`

A `signing_authorizations` row is the **only** thing that grants the server permission to sign a typed-data payload on a user's behalf. Every row is:

- **Payload-bound** (`payload_hash` = sha256 of the canonicalized typed_data).
- **Single-use by default** (`max_uses = 1`, `used_count` decremented atomically with the Privy SDK call).
- **Short-lived** (`expires_at = now() + 60s`).
- **Optionally** gated on an `interactive_confirmations` row for high-risk purposes.
- **Bound to the originating Hydra session** so a stolen token replayed against an unrelated session can be diagnosed and contained.

```sql
-- Provider Containment + Signing Authority invariants:
-- - vana_user_id is the canonical subject; provider DIDs MUST NOT appear.
-- - One row authorizes exactly one signTypedData call (max_uses=1, payload_hash bound).
-- - Atomic consume in same transaction as the SDK call closes TOCTOU.
CREATE TABLE IF NOT EXISTS signing_authorizations (
  id                      TEXT PRIMARY KEY,                                    -- vana_auth_<32hex>
  vana_user_id            TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id          TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose                 TEXT NOT NULL,                                       -- closed enum, runtime-checked
  payload_hash            TEXT NOT NULL,                                       -- sha256 hex of canonicalized typed_data
  max_uses                INT  NOT NULL DEFAULT 1,
  used_count              INT  NOT NULL DEFAULT 0,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at             TIMESTAMPTZ,
  confirmation_event_id   TEXT REFERENCES interactive_confirmations(id),       -- nullable; required for high-risk purposes
  hydra_session_id        TEXT NOT NULL,

  CHECK (used_count >= 0),
  CHECK (used_count <= max_uses),
  CHECK (max_uses >= 1),
  CHECK (length(payload_hash) = 64)                                            -- 32-byte sha256 hex
);

-- Prevent two unconsumed authorities for the same payload (round-1 sec #2).
-- Once a row is consumed (used_count >= 1), the partial index releases the
-- payload_hash slot, so a subsequent (purpose, payload) cycle for the same
-- user is allowed but never two simultaneously-live authorities.
CREATE UNIQUE INDEX IF NOT EXISTS signing_authorizations_payload_live_idx
  ON signing_authorizations (payload_hash)
  WHERE used_count = 0;

-- Ops queries: "show me the last N authorities for user X with purpose Y".
CREATE INDEX IF NOT EXISTS signing_authorizations_user_purpose_idx
  ON signing_authorizations (vana_user_id, purpose, created_at DESC);

-- Janitorial queries.
CREATE INDEX IF NOT EXISTS signing_authorizations_expires_idx
  ON signing_authorizations (expires_at)
  WHERE consumed_at IS NULL;
```

**Atomic-consume pattern.** The Privy SDK call must be wrapped in the same transaction as the consume statement so a successful sign always corresponds to a consumed row, and a failed sign rolls back the consume:

```sql
UPDATE signing_authorizations
SET    used_count   = used_count + 1,
       consumed_at  = now()
WHERE  id           = $1
  AND  used_count   < max_uses
  AND  expires_at   > now()
RETURNING *;
```

Zero rows back means "expired or already consumed" — call site must surface this as `401 authority_invalid` rather than retrying.

```typescript
// src/lib/db/auth-signing.ts

export type Purpose =
  | "register_personal_server"
  | "register_personal_server_deregistration"
  | "create_grant"
  | "revoke_grant"
  | "register_builder";

export type SigningAuthorizationRow = {
  id: string;
  vana_user_id: VanaUserId;
  vana_wallet_id: VanaWalletId;
  purpose: Purpose;
  payload_hash: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
  confirmation_event_id: string | null;
  hydra_session_id: HydraSessionId;
};

export type CreateSigningAuthorizationInput = {
  vanaUserId: VanaUserId;
  vanaWalletId: VanaWalletId;
  purpose: Purpose;
  payloadHash: string;
  confirmationEventId?: string;
  hydraSessionId: HydraSessionId;
  // Both default at the column level; pass overrides only for tests.
  maxUses?: number;
  ttlSeconds?: number;
};

export function generateSigningAuthorizationId(): string;

export async function createSigningAuthorization(
  input: CreateSigningAuthorizationInput,
): Promise<SigningAuthorizationRow>;

/**
 * Atomic consume. Returns the row on success; returns null if the row is
 * expired, already consumed, or does not exist. Caller MUST treat null as
 * "do NOT sign" — the SDK call is gated on a non-null return.
 *
 * In practice, callers wrap the Privy SDK call and this consume in the same
 * `sql.transaction(...)` so a sign failure rolls the consume back.
 */
export async function consumeSigningAuthorization(
  id: string,
): Promise<SigningAuthorizationRow | null>;

export async function findSigningAuthorizationById(
  id: string,
): Promise<SigningAuthorizationRow | null>;
```

---

### 2.2 `interactive_confirmations`

A row in `interactive_confirmations` is **proof that the user clicked through a UI prompt and saw the verbatim summary of the typed-data payload**. High-risk purposes (`register_personal_server`, `create_grant`, `revoke_grant`, `register_personal_server_deregistration`) require a non-null `confirmation_event_id` on the resulting `signing_authorizations` row.

The `id` is server-generated with ≥128 bits of crypto entropy (`crypto.randomBytes(16)`), shaped `vana_conf_<32hex>`. It is opaque to the client.

The `payload_summary` column stores the **verbatim JSON the user saw**. The route handler renders the summary from the same canonicalized payload that produces `payload_hash`, so a property test (Stage 5.7) can assert "every field in the typed_data appears in the summary or the route fails closed" — closing the round-2 finding (a) summary-tampering hole.

Two TTLs (decoupled per round-2 B.1.2):

- `interactive_confirmations.expires_at` = 5 min — read-the-summary friendly.
- The `signing_authorizations` row issued from a confirmed event still expires in 60 s.

```sql
-- Generic "user clicked Confirm with this verbatim summary visible" record.
-- Required for high-risk purposes; consumed atomically with the signing op.
CREATE TABLE IF NOT EXISTS interactive_confirmations (
  id                  TEXT PRIMARY KEY,                                        -- vana_conf_<32hex>, ≥128 bits crypto-random
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id      TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose             TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  payload_summary     JSONB NOT NULL,                                          -- verbatim summary the user saw
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at         TIMESTAMPTZ,
  consumed_result     JSONB,                                                   -- cached signing result for 30s grace replays
  hydra_session_id    TEXT NOT NULL,

  CHECK (length(payload_hash) = 64)
);

-- Keying for "does this user already have a confirmation for this payload?"
-- per round-2 B.1.4 (two simultaneous confirmations key on payload, not purpose).
CREATE INDEX IF NOT EXISTS interactive_confirmations_user_payload_idx
  ON interactive_confirmations (vana_user_id, payload_hash);

CREATE INDEX IF NOT EXISTS interactive_confirmations_expires_idx
  ON interactive_confirmations (expires_at)
  WHERE consumed_at IS NULL;
```

**Idempotent replay window.** Once `consumed_at` is set, replays of the same `confirmation_id` within 30 s return the cached `consumed_result` (stored as JSONB) instead of attempting a fresh signing operation. After 30 s, the route returns `410 consumed`. This protects against the "network blip after Confirm click" case (round-2 B.1.3).

```typescript
// src/lib/db/auth-signing.ts (continued)

export type InteractiveConfirmationRow = {
  id: string;
  vana_user_id: VanaUserId;
  vana_wallet_id: VanaWalletId;
  purpose: Purpose;
  payload_hash: string;
  payload_summary: unknown;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
  consumed_result: unknown | null;
  hydra_session_id: HydraSessionId;
};

export type CreateInteractiveConfirmationInput = {
  vanaUserId: VanaUserId;
  vanaWalletId: VanaWalletId;
  purpose: Purpose;
  payloadHash: string;
  payloadSummary: unknown;
  hydraSessionId: HydraSessionId;
};

export function generateInteractiveConfirmationId(): string;

export async function createInteractiveConfirmation(
  input: CreateInteractiveConfirmationInput,
): Promise<InteractiveConfirmationRow>;

export async function getInteractiveConfirmation(
  id: string,
): Promise<InteractiveConfirmationRow | null>;

/**
 * Atomically marks the row consumed and stores the result. Caller invokes
 * this inside the same transaction as the signing op so a sign failure
 * rolls the consume back and the user can retry.
 *
 * Returns null if the row is expired, already consumed, or does not exist.
 */
export async function consumeInteractiveConfirmation(
  id: string,
  consumedResult: unknown,
): Promise<InteractiveConfirmationRow | null>;

/**
 * 30-second grace replay. Returns the cached signing result if the row was
 * consumed within the last 30s; null otherwise (caller falls through to
 * either the consume path or `410 consumed` based on `consumed_at`).
 */
export async function getCachedConfirmationResult(
  id: string,
): Promise<unknown | null>;
```

---

### 2.3 `vana_session_tombstones`

DB-backed deny-list of revoked Hydra sessions, checked on **every** introspection-cache hit by `getVanaSession()`. Multi-lambda safe: `getVanaSession` may have a stale 30 s introspection cache, but the tombstone is single-source-of-truth and is read on every call.

```sql
-- Fail-closed logout primitive. Verifier rejects any token whose
-- hydra_session_id appears here, even on cache hit. TTL = 15 min covers
-- the longest realistic introspection-cache window plus refresh-token TTL
-- skew; rows past expires_at are deleted by a janitor job.
CREATE TABLE IF NOT EXISTS vana_session_tombstones (
  hydra_session_id    TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS vana_session_tombstones_expires_idx
  ON vana_session_tombstones (expires_at);
```

**Cleanup.** A janitor (cron/Vercel Cron or a manual sweep during Stage 9 runbook) runs:

```sql
DELETE FROM vana_session_tombstones WHERE expires_at < now();
```

Until the janitor exists, the table grows unboundedly slowly (one row per logout × 15 min retention). Acceptable for dev.

```typescript
// src/lib/db/sessions.ts

export type VanaSessionTombstoneRow = {
  hydra_session_id: HydraSessionId;
  vana_user_id: VanaUserId;
  created_at: string;
  expires_at: string;
};

export async function addSessionTombstone(
  hydraSessionId: HydraSessionId,
  vanaUserId: VanaUserId,
): Promise<VanaSessionTombstoneRow>;

/**
 * Source of truth for "is this session revoked?". Called by getVanaSession
 * on every request, including introspection-cache hits.
 */
export async function isSessionTombstoned(
  hydraSessionId: HydraSessionId,
): Promise<boolean>;

export async function deleteExpiredTombstones(): Promise<number>;
```

---

### 2.4 `vana_refresh_tokens`

Encrypted-at-rest refresh tokens with rotation + family-level reuse detection.

- **Encryption**: AES-256-GCM. Per-row 96-bit IV in `iv` column. Ciphertext in `ciphertext`.
- **KEK source**: env var `VANA_REFRESH_TOKEN_KEK`, base64-encoded 32-byte key. **MUST be distinct from `PRIVY_SIGNER_PRIVATE_KEY`.** Documented in `security-debt.md` (and the env-var setup runbook in Stage 9).
- **KEK rotation**: `kek_version` column allows running with multiple KEK versions during rotation; decrypt picks the row's version, encrypt always uses the latest.
- **Reuse detection**: every row has a `family_id`. On rotation, the old row's `rotated_at` is set, a new row inherits the same `family_id`. Presenting a token whose row already has `rotated_at != NULL` indicates replay — entire `family_id` chain is revoked (`revoked_at = now()` on every row).

```sql
CREATE TABLE IF NOT EXISTS vana_refresh_tokens (
  id                  TEXT PRIMARY KEY,                                        -- vana_rt_<32hex>
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id    TEXT NOT NULL,
  family_id           TEXT NOT NULL,                                           -- groups rotated tokens
  ciphertext          BYTEA NOT NULL,
  iv                  BYTEA NOT NULL,                                          -- per-row, 96-bit for GCM
  kek_version         INT  NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,

  CHECK (octet_length(iv) = 12),
  CHECK (octet_length(ciphertext) > 0)
);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_user_idx
  ON vana_refresh_tokens (vana_user_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_session_idx
  ON vana_refresh_tokens (hydra_session_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_family_idx
  ON vana_refresh_tokens (family_id);
```

**Rotation pseudocode** (implemented inside `useRefreshToken`):

```text
BEGIN;
  SELECT * FROM vana_refresh_tokens
  WHERE  /* match plaintext via decrypt-and-compare */
  FOR UPDATE;

  -- replay detection
  IF row.rotated_at IS NOT NULL THEN
    UPDATE vana_refresh_tokens SET revoked_at = now()
    WHERE family_id = row.family_id AND revoked_at IS NULL;
    RETURN { reuseDetected: true, familyId: row.family_id };
  END IF;

  IF row.revoked_at IS NOT NULL OR /* TTL exceeded */ THEN
    RETURN null;
  END IF;

  UPDATE vana_refresh_tokens SET rotated_at = now() WHERE id = row.id;

  INSERT INTO vana_refresh_tokens (id, vana_user_id, hydra_session_id, family_id,
                                   ciphertext, iv, kek_version)
  VALUES (...new row, same family_id...);
COMMIT;
```

Reading by plaintext requires either an HMAC-of-plaintext lookup column or a small candidate-set scan keyed on `(hydra_session_id, family_id)` taken from the access-token introspection. The implementation uses the latter — Hydra's introspection result includes the session id, which narrows the search to a handful of rows.

```typescript
// src/lib/db/sessions.ts (continued)

export type VanaRefreshTokenRow = {
  id: string;
  vana_user_id: VanaUserId;
  hydra_session_id: HydraSessionId;
  family_id: string;
  ciphertext: Buffer;
  iv: Buffer;
  kek_version: number;
  created_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
};

export type StoreRefreshTokenInput = {
  vanaUserId: VanaUserId;
  hydraSessionId: HydraSessionId;
  plaintext: string;
  /** New family on first issuance; same family on rotation. */
  familyId?: string;
};

export async function storeRefreshToken(
  input: StoreRefreshTokenInput,
): Promise<VanaRefreshTokenRow>;

export type UseRefreshTokenResult =
  | { vanaUserId: VanaUserId; familyId: string }
  | { reuseDetected: true; familyId: string };

/**
 * Atomically rotates the presented refresh token. Returns the new family/user
 * binding on success, OR `{ reuseDetected: true }` if the row was already
 * rotated (entire family is revoked as a side effect). Returns null for
 * "unknown / revoked / expired" so the caller cannot distinguish.
 */
export async function useRefreshToken(
  plaintext: string,
): Promise<UseRefreshTokenResult | null>;

export async function revokeRefreshTokenFamily(
  familyId: string,
): Promise<number>;
```

The encryption helpers live next to the repo functions:

```typescript
// src/lib/auth/refresh-token-crypto.ts

export function encryptRefreshToken(plaintext: string): {
  ciphertext: Buffer;
  iv: Buffer;
  kekVersion: number;
};

export function decryptRefreshToken(input: {
  ciphertext: Buffer;
  iv: Buffer;
  kekVersion: number;
}): string;
```

---

### 2.5 Migrations to existing tables

**`vana_linked_wallets.key_control_type`.** Distinguishes server-signable provider-embedded wallets (Privy/Para custodial) from user-controlled EOAs (which require an interactive challenge — deferred) and future smart accounts. Default `provider_embedded` for the existing dev row (Tim's).

```sql
CREATE TYPE vana_key_control_type AS ENUM (
  'provider_embedded',
  'user_controlled_eoa',
  'smart_account'
);

ALTER TABLE vana_linked_wallets
  ADD COLUMN key_control_type vana_key_control_type NOT NULL DEFAULT 'provider_embedded';
```

**`oauth_clients.owner_vana_user_id`.** Replaces `owner_address` as the canonical owner key for admin oauth-clients flow. **Nullable during PR-1 transition.** Backfill in PR-1: for every row, look up the wallet address in `vana_linked_wallets` and set `owner_vana_user_id` to the joined `vana_user_id`. Hard date for dropping `owner_address`: the cleanup PR opens within 7 days of PR-1 merging; see `00-execution-plan.md` §4G.

```sql
ALTER TABLE oauth_clients
  ADD COLUMN owner_vana_user_id TEXT REFERENCES vana_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS oauth_clients_owner_vana_user_idx
  ON oauth_clients (owner_vana_user_id);

-- Backfill (executed inline; greenfield dev DB has at most a handful of rows).
UPDATE oauth_clients oc
SET    owner_vana_user_id = w.vana_user_id
FROM   vana_linked_wallets w
WHERE  oc.owner_vana_user_id IS NULL
  AND  w.chain_type = 'evm'
  AND  w.address    = lower(oc.owner_address);
```

**`personal_servers.user_id` semantics flip.** The column type stays `TEXT`, but the meaning changes from "lowercased EVM address" to `vana_user_id`. **Greenfield wipe approach** (per Stage 0: Tim is the only user; we wipe and recreate dev rows). The migration script drops the existing rows and recreates Tim's via the existing provisioning path; no in-place backfill is needed.

```sql
-- Greenfield wipe for personal_servers.user_id semantics flip.
-- Before: user_id = lowercase EVM address. After: user_id = vana_user_id.
-- Zero-downtime backfill is unnecessary: dev DB only, single user, server
-- can be reprovisioned via the runbook in Stage 9.
DELETE FROM personal_servers;
-- Re-provisioning happens via /api/servers POST after the migration runs.
```

**`register_builder` exception.** This purpose is included in the closed enum but is **not a user-custody operation**. It uses a separate server-EOA signer key (per the existing `register-builder.ts`), not the user's provider-embedded wallet. No `signing_authorizations` row is required for `register_builder`; the route is documented as a server-EOA exception. The enum still includes it so the same `Purpose` type can flow through the audit log without a second enum.

---

### 2.6 Closed `purpose` enum

The enum is closed — adding a new purpose requires a code change in `src/lib/auth/signing-purposes.ts` plus a per-purpose validator. The runtime check rejects unknown strings before any DB write.

| Purpose                                   | Risk       | Confirmation required? | Notes                                     |
| ----------------------------------------- | ---------- | ---------------------- | ----------------------------------------- |
| `register_personal_server`                | high       | yes                    | Mints on-chain server identity            |
| `register_personal_server_deregistration` | high       | yes                    | Tears down on-chain server identity       |
| `create_grant`                            | high       | yes                    | Grants data access to a builder           |
| `revoke_grant`                            | high       | yes                    | Revokes a previously-issued grant         |
| `register_builder`                        | server-EOA | n/a (not user-custody) | Separate signer key; documented exception |

```typescript
// src/lib/auth/signing-purposes.ts

export const PURPOSES = [
  "register_personal_server",
  "register_personal_server_deregistration",
  "create_grant",
  "revoke_grant",
  "register_builder",
] as const;

export type Purpose = (typeof PURPOSES)[number];

export const HIGH_RISK_PURPOSES: ReadonlySet<Purpose> = new Set([
  "register_personal_server",
  "register_personal_server_deregistration",
  "create_grant",
  "revoke_grant",
]);

export function assertPurpose(v: string): asserts v is Purpose {
  if (!(PURPOSES as readonly string[]).includes(v)) {
    throw new Error(`unknown purpose: ${v}`);
  }
}

export function requiresInteractiveConfirmation(p: Purpose): boolean {
  return HIGH_RISK_PURPOSES.has(p);
}
```

---

### 2.7 Migration script outline — `008_signing_auth_plane.sql`

Single migration file. Runs end-to-end on the dev DB. Order matters: types before columns that reference them; tables in dependency order; backfills last.

```sql
-- migrations/008_signing_auth_plane.sql
--
-- Stage 2 of the auth & custody redesign. Encodes the Signing Authority
-- Invariant (every server-side sign is mediated by a payload-bound,
-- single-use authority row) and the Provider Containment Invariant (every
-- new row keys on vana_user_id, never a provider DID).
--
-- See docs/auth-redesign/01-architecture.md §2 for the full DDL spec.

BEGIN;

-- 1. Enum types (must exist before columns that use them).
CREATE TYPE vana_key_control_type AS ENUM (
  'provider_embedded',
  'user_controlled_eoa',
  'smart_account'
);

-- 2. Column additions to existing tables.
ALTER TABLE vana_linked_wallets
  ADD COLUMN key_control_type vana_key_control_type NOT NULL DEFAULT 'provider_embedded';

ALTER TABLE oauth_clients
  ADD COLUMN owner_vana_user_id TEXT REFERENCES vana_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS oauth_clients_owner_vana_user_idx
  ON oauth_clients (owner_vana_user_id);

-- 3. New tables. interactive_confirmations is created BEFORE
--    signing_authorizations because the latter has a FK to the former.
CREATE TABLE IF NOT EXISTS interactive_confirmations (
  id                  TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id      TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose             TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  payload_summary     JSONB NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at         TIMESTAMPTZ,
  consumed_result     JSONB,
  hydra_session_id    TEXT NOT NULL,
  CHECK (length(payload_hash) = 64)
);

CREATE INDEX IF NOT EXISTS interactive_confirmations_user_payload_idx
  ON interactive_confirmations (vana_user_id, payload_hash);

CREATE INDEX IF NOT EXISTS interactive_confirmations_expires_idx
  ON interactive_confirmations (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS signing_authorizations (
  id                      TEXT PRIMARY KEY,
  vana_user_id            TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id          TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose                 TEXT NOT NULL,
  payload_hash            TEXT NOT NULL,
  max_uses                INT  NOT NULL DEFAULT 1,
  used_count              INT  NOT NULL DEFAULT 0,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at             TIMESTAMPTZ,
  confirmation_event_id   TEXT REFERENCES interactive_confirmations(id),
  hydra_session_id        TEXT NOT NULL,
  CHECK (used_count >= 0),
  CHECK (used_count <= max_uses),
  CHECK (max_uses >= 1),
  CHECK (length(payload_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS signing_authorizations_payload_live_idx
  ON signing_authorizations (payload_hash)
  WHERE used_count = 0;

CREATE INDEX IF NOT EXISTS signing_authorizations_user_purpose_idx
  ON signing_authorizations (vana_user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS signing_authorizations_expires_idx
  ON signing_authorizations (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS vana_session_tombstones (
  hydra_session_id    TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS vana_session_tombstones_expires_idx
  ON vana_session_tombstones (expires_at);

CREATE TABLE IF NOT EXISTS vana_refresh_tokens (
  id                  TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id    TEXT NOT NULL,
  family_id           TEXT NOT NULL,
  ciphertext          BYTEA NOT NULL,
  iv                  BYTEA NOT NULL,
  kek_version         INT  NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  CHECK (octet_length(iv) = 12),
  CHECK (octet_length(ciphertext) > 0)
);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_user_idx
  ON vana_refresh_tokens (vana_user_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_session_idx
  ON vana_refresh_tokens (hydra_session_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_family_idx
  ON vana_refresh_tokens (family_id);

-- 4. Greenfield wipe of personal_servers (semantics flip).
--    Tim's row will be reprovisioned via /api/servers POST per the runbook.
DELETE FROM personal_servers;

-- 5. Backfill oauth_clients.owner_vana_user_id from owner_address.
UPDATE oauth_clients oc
SET    owner_vana_user_id = w.vana_user_id
FROM   vana_linked_wallets w
WHERE  oc.owner_vana_user_id IS NULL
  AND  w.chain_type = 'evm'
  AND  w.address    = lower(oc.owner_address);

COMMIT;
```

**Rollback note.** This migration is forward-only on dev. If a rollback is required during development, drop the new tables in reverse order, drop the added columns, and drop the enum type. Personal servers must be reprovisioned regardless of direction.

**Acceptance.** After running this migration on the dev DB:

1. `\d signing_authorizations` shows the partial unique index on `payload_hash WHERE used_count = 0`.
2. `\d vana_linked_wallets` shows `key_control_type` defaulting to `provider_embedded`.
3. `SELECT count(*) FROM oauth_clients WHERE owner_vana_user_id IS NULL` returns the count of clients whose owner wallet was never linked to a Vana user (zero in dev).
4. `SELECT count(*) FROM personal_servers` returns 0; reprovisioning via the runbook restores Tim's row with `user_id = vana_user_<...>`.
5. Repository functions in `src/lib/db/auth-signing.ts` and `src/lib/db/sessions.ts` round-trip rows correctly via the unit tests in §2.3 of the execution plan.
