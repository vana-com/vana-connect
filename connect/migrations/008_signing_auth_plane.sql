-- Stage 2 of the auth & custody redesign.
--
-- Encodes:
--   - Signing Authority Invariant (SAI): every server-side sign is mediated
--     by a payload-bound, single-use authority row issued at the call site.
--   - Provider Containment Invariant (PCI): every new row keys on
--     vana_user_id; provider DIDs do not appear here.
--
-- Greenfield assumptions (Tim is the only user):
--   - personal_servers.user_id semantics flips from lowercase EVM address to
--     vana_user_id. Existing rows are wiped; reprovisioning happens via
--     POST /api/servers per the runbook in 10-runbook.md.
--   - oauth_clients.owner_vana_user_id is added as nullable; backfilled
--     from vana_linked_wallets at the bottom of this migration. owner_address
--     is dropped in a follow-up cleanup PR with hard date in the plan.
--
-- See docs/auth-redesign/01-architecture.md and
-- docs/auth-redesign/_drafts/01-architecture-ddl.md for full spec.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enum types (must exist before columns that use them).
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE vana_key_control_type AS ENUM (
    'provider_embedded',
    'user_controlled_eoa',
    'smart_account'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Column additions to existing tables.
-- ---------------------------------------------------------------------------

-- vana_linked_wallets.key_control_type — distinguishes provider-custodied
-- wallets (server-signable) from user-controlled EOAs (interactive only)
-- and future smart accounts. Default 'provider_embedded' for existing rows.
ALTER TABLE vana_linked_wallets
  ADD COLUMN IF NOT EXISTS key_control_type vana_key_control_type NOT NULL DEFAULT 'provider_embedded';

-- oauth_clients.owner_vana_user_id — replaces owner_address as canonical
-- owner key. Nullable during PR-1 transition; backfilled below.
ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS owner_vana_user_id TEXT REFERENCES vana_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS oauth_clients_owner_vana_user_idx
  ON oauth_clients (owner_vana_user_id);

-- ---------------------------------------------------------------------------
-- 3. New tables.
--
-- interactive_confirmations is created BEFORE signing_authorizations because
-- the latter has a FK to the former.
-- ---------------------------------------------------------------------------

-- Generic "user clicked Confirm with this verbatim summary visible" record.
-- Required for high-risk purposes (register_personal_server, create_grant,
-- revoke_grant, register_personal_server_deregistration). The route handler
-- renders payload_summary from the same canonicalized payload that produces
-- payload_hash, so a property test can assert "every typed-data field appears
-- in the summary or the route fails closed" (closes round-2 audit finding a).
--
-- Two TTLs decoupled (round-2 B.1.2):
--   * interactive_confirmations.expires_at = 5 min — read-the-summary friendly.
--   * signing_authorizations.expires_at    = 60 s — short-lived single-use.
--
-- Idempotent replay: within 30s of consumed_at, the route looks up the
-- consumed signing_authorizations row by confirmation_id (FK) to return the
-- cached signature instead of re-signing. Past 30s: 410 consumed.
CREATE TABLE IF NOT EXISTS interactive_confirmations (
  id                  TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id      TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  hydra_session_id    TEXT NOT NULL,
  purpose             TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  payload_summary     JSONB NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at         TIMESTAMPTZ,
  CHECK (length(payload_hash) = 64)
);

-- Keying for "does this user already have a confirmation for this payload?"
-- per round-2 B.1.4 (two simultaneous confirmations key on payload, not
-- purpose).
CREATE INDEX IF NOT EXISTS interactive_confirmations_user_payload_idx
  ON interactive_confirmations (vana_user_id, payload_hash);

CREATE INDEX IF NOT EXISTS interactive_confirmations_session_idx
  ON interactive_confirmations (hydra_session_id);

CREATE INDEX IF NOT EXISTS interactive_confirmations_expires_idx
  ON interactive_confirmations (expires_at)
  WHERE consumed_at IS NULL;

-- The only thing that grants the server permission to sign a typed-data
-- payload on a user's behalf. Every row is:
--   * Payload-bound (payload_hash = sha256 of canonicalized typed_data).
--   * Single-use by default (max_uses = 1; used_count atomically decremented
--     in the same transaction as the Privy SDK call).
--   * Short-lived (expires_at = now() + 60s).
--   * Optionally gated on an interactive_confirmations row for high-risk
--     purposes.
--   * Bound to the originating Hydra session for audit + containment.
CREATE TABLE IF NOT EXISTS signing_authorizations (
  id                      TEXT PRIMARY KEY,
  vana_user_id            TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id          TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  hydra_session_id        TEXT NOT NULL,
  purpose                 TEXT NOT NULL,
  payload_hash            TEXT NOT NULL,
  payload_summary         JSONB NOT NULL,
  max_uses                INT  NOT NULL DEFAULT 1,
  used_count              INT  NOT NULL DEFAULT 0,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at             TIMESTAMPTZ,
  confirmation_id         TEXT REFERENCES interactive_confirmations(id),

  CHECK (used_count >= 0),
  CHECK (used_count <= max_uses),
  CHECK (max_uses >= 1),
  CHECK (length(payload_hash) = 64)
);

-- Prevent two unconsumed authorities for the same payload (round-1 sec #2).
-- Once consumed (consumed_at IS NOT NULL), the partial index releases the
-- slot, so a subsequent (purpose, payload) cycle for the same user is
-- allowed but never two simultaneously-live authorities.
CREATE UNIQUE INDEX IF NOT EXISTS signing_authorizations_payload_live_idx
  ON signing_authorizations (payload_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS signing_authorizations_user_purpose_idx
  ON signing_authorizations (vana_user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS signing_authorizations_expires_idx
  ON signing_authorizations (expires_at)
  WHERE consumed_at IS NULL;

-- DB-backed deny-list of revoked Hydra sessions. Checked on every
-- introspection-cache hit by getVanaSession(). Multi-lambda safe: cache
-- may be stale 30s, but tombstone is single-source-of-truth and read on
-- every call. TTL 30 min covers 15 min access TTL plus skew.
CREATE TABLE IF NOT EXISTS vana_session_tombstones (
  hydra_session_id    TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  revoked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS vana_session_tombstones_expires_idx
  ON vana_session_tombstones (expires_at);

-- Encrypted refresh tokens with rotation + family-level reuse detection.
-- AES-256-GCM. Per-row 96-bit IV in `iv`; 128-bit GCM tag in `auth_tag`;
-- ciphertext (without tag) in `refresh_token_enc`. KEK from
-- REFRESH_TOKEN_ENC_KEY env var (base64 32-byte key); MUST be distinct
-- from PRIVY_SIGNER_PRIVATE_KEY. Optional REFRESH_TOKEN_ENC_KEY_OLD allows
-- rotation: decrypt tries new then old, encrypt always uses new.
-- Reuse detection: presenting a token whose row already has rotated_at !=
-- NULL revokes the entire family_id chain.
CREATE TABLE IF NOT EXISTS vana_refresh_tokens (
  id                  TEXT PRIMARY KEY,
  vana_user_id        TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id    TEXT NOT NULL,
  family_id           TEXT NOT NULL,
  refresh_token_enc   BYTEA NOT NULL,
  iv                  BYTEA NOT NULL,
  auth_tag            BYTEA NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,

  CHECK (octet_length(iv) = 12),
  CHECK (octet_length(auth_tag) = 16),
  CHECK (octet_length(refresh_token_enc) > 0)
);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_user_idx
  ON vana_refresh_tokens (vana_user_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_session_idx
  ON vana_refresh_tokens (hydra_session_id);

CREATE INDEX IF NOT EXISTS vana_refresh_tokens_family_idx
  ON vana_refresh_tokens (family_id);

-- ---------------------------------------------------------------------------
-- 4. Greenfield wipe of personal_servers (semantics flip).
--    Tim's row is reprovisioned via /api/servers POST per the runbook.
-- ---------------------------------------------------------------------------

DELETE FROM personal_servers;

-- ---------------------------------------------------------------------------
-- 5. Backfill oauth_clients.owner_vana_user_id from owner_address.
-- ---------------------------------------------------------------------------

UPDATE oauth_clients oc
SET    owner_vana_user_id = w.vana_user_id
FROM   vana_linked_wallets w
WHERE  oc.owner_vana_user_id IS NULL
  AND  w.chain_type = 'evm'
  AND  w.address    = lower(oc.owner_address);

COMMIT;
