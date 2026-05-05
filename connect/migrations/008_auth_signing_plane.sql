-- Vana auth & custody redesign — signing authority plane.
--
-- Implements the Signing Authority Invariant (SAI) per
-- docs/auth-redesign/01-architecture.md §1.2 and §2.
--
-- Server-side signing on a user's behalf requires:
--   1. An explicit, single-use, payload-bound signing_authorizations row
--      issued at the call site, in the same DB transaction as the
--      provider SDK call (no TOCTOU).
--   2. For high-risk purposes, an interactive_confirmations row consumed
--      ≤30s ago whose payload_hash matches the authority's payload_hash.
--
-- Refresh tokens encrypted at rest with REFRESH_TOKEN_ENC_KEY (Vercel
-- env var, distinct from PRIVY_SIGNER_PRIVATE_KEY). AES-256-GCM with
-- per-row IV; rotation re-encrypts.
--
-- Multi-lambda revocation via vana_session_tombstones — checked on every
-- introspection-cache hit so logout takes effect across instances.

-- 1. signing_authorizations -------------------------------------------------
CREATE TABLE IF NOT EXISTS signing_authorizations (
  id               TEXT PRIMARY KEY,                                       -- vana_sigauth_<32hex>
  vana_user_id     TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id   TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  hydra_session_id TEXT NOT NULL,
  purpose          TEXT NOT NULL,                                          -- closed enum, validated at app layer
  payload_hash     TEXT NOT NULL,                                          -- sha256(canonicalize(typedData))
  payload_summary  JSONB NOT NULL,                                         -- verbatim summary user saw at confirmation
  confirmation_id  TEXT,                                                   -- nullable; set for high-risk purposes
  max_uses         INT  NOT NULL DEFAULT 1,
  used_count       INT  NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replay defense: at most one unconsumed authority per payload.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signing_auth_unconsumed_payload
  ON signing_authorizations (payload_hash) WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_signing_auth_user
  ON signing_authorizations (vana_user_id);

CREATE INDEX IF NOT EXISTS ix_signing_auth_confirmation
  ON signing_authorizations (confirmation_id) WHERE confirmation_id IS NOT NULL;

-- 2. interactive_confirmations ---------------------------------------------
CREATE TABLE IF NOT EXISTS interactive_confirmations (
  id               TEXT PRIMARY KEY,                                       -- vana_confirm_<32hex>
  vana_user_id     TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id TEXT NOT NULL,
  vana_wallet_id   TEXT NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose          TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,                                          -- same hash as the resulting authority
  payload_summary  JSONB NOT NULL,                                         -- the human-readable JSON the user saw
  expires_at       TIMESTAMPTZ NOT NULL,                                   -- DEFAULT now() + 5min (UX-friendly)
  consumed_at      TIMESTAMPTZ,                                            -- atomic UPDATE WHERE consumed_at IS NULL
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_confirmations_session
  ON interactive_confirmations (hydra_session_id);

CREATE INDEX IF NOT EXISTS ix_confirmations_payload
  ON interactive_confirmations (payload_hash);

-- Add FK constraint after both tables exist so ordering doesn't matter.
ALTER TABLE signing_authorizations
  ADD CONSTRAINT fk_signing_auth_confirmation
  FOREIGN KEY (confirmation_id) REFERENCES interactive_confirmations(id);

-- 3. vana_refresh_tokens ---------------------------------------------------
-- Encrypted-at-rest refresh tokens. Family-tracked for reuse detection per
-- RFC 6749 §6: presenting a previously-rotated token revokes the family.
CREATE TABLE IF NOT EXISTS vana_refresh_tokens (
  id                TEXT PRIMARY KEY,                                      -- vana_rt_<32hex>
  vana_user_id      TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id  TEXT NOT NULL,
  refresh_token_enc BYTEA NOT NULL,                                        -- AES-256-GCM ciphertext
  iv                BYTEA NOT NULL,                                        -- 12-byte IV per row
  auth_tag          BYTEA NOT NULL,                                        -- 16-byte GCM tag per row
  family_id         TEXT NOT NULL,                                         -- shared across rotated tokens
  expires_at        TIMESTAMPTZ NOT NULL,
  rotated_at        TIMESTAMPTZ,                                           -- non-null after rotation
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_refresh_user
  ON vana_refresh_tokens (vana_user_id);

CREATE INDEX IF NOT EXISTS ix_refresh_family
  ON vana_refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS ix_refresh_session
  ON vana_refresh_tokens (hydra_session_id);

-- 4. vana_session_tombstones -----------------------------------------------
-- Multi-lambda revocation. Inserted FIRST during logout, before any best-
-- effort calls to Hydra. getVanaSession() checks this on every introspection
-- cache hit, so revocation propagates within ≤5s across all instances.
CREATE TABLE IF NOT EXISTS vana_session_tombstones (
  hydra_session_id TEXT PRIMARY KEY,
  vana_user_id     TEXT NOT NULL,
  revoked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL                                    -- TTL = max access TTL (15min) + safety margin
);

CREATE INDEX IF NOT EXISTS ix_tombstone_user
  ON vana_session_tombstones (vana_user_id);

CREATE INDEX IF NOT EXISTS ix_tombstone_expires
  ON vana_session_tombstones (expires_at);

-- 5. key_control_type on vana_linked_wallets -------------------------------
-- Drives wallet API branching:
--   provider_embedded   → server-signable via wallet-providers/*.ts
--   user_controlled_eoa → wallet API returns not_supported_yet
--   smart_account       → reserved for future EIP-7702 / session-key flows
ALTER TABLE vana_linked_wallets
  ADD COLUMN IF NOT EXISTS key_control_type TEXT NOT NULL DEFAULT 'provider_embedded'
  CHECK (key_control_type IN ('provider_embedded', 'user_controlled_eoa', 'smart_account'));

-- 6. owner_vana_user_id on oauth_clients -----------------------------------
-- Dual-column window during PR-Y migration. Backfilled from owner_address
-- via a one-shot script that joins vana_linked_wallets on (chain_type='evm',
-- address=lower(owner_address)) and resolves to vana_user_id. owner_address
-- is dropped in a follow-up cleanup PR after PR-Y lands.
ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS owner_vana_user_id TEXT;

CREATE INDEX IF NOT EXISTS ix_oauth_clients_owner_vana_user_id
  ON oauth_clients (owner_vana_user_id);
