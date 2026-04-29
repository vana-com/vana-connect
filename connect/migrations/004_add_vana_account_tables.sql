-- Vana account identity model.
--
-- vana_users is the OIDC subject source of truth: every account-hosted OIDC
-- token uses vana_users.id (a vana_user_... opaque id) as `sub`. Wallet
-- addresses, Privy ids, emails, and OAuth provider subjects live in
-- vana_linked_wallets / vana_provider_links as evidence and metadata only.
-- They are never the OIDC subject. Transitional merge logic may use verified
-- provider subjects or linked-wallet addresses; email is intentionally not a
-- merge key.

CREATE TABLE IF NOT EXISTS vana_users (
  id              TEXT PRIMARY KEY,           -- vana_user_<random>
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vana_linked_wallets (
  id                 TEXT PRIMARY KEY,         -- vana_wallet_<random>
  vana_user_id       TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,            -- 'privy', 'injected', 'cli', etc.
  provider_wallet_id TEXT,                     -- e.g. Privy wallet id
  chain_type         TEXT NOT NULL,            -- 'evm' | 'solana' | other
  address            TEXT NOT NULL,            -- normalized: lowercase for evm
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_type, address)
);

CREATE INDEX IF NOT EXISTS vana_linked_wallets_user_idx
  ON vana_linked_wallets (vana_user_id);

CREATE INDEX IF NOT EXISTS vana_linked_wallets_provider_idx
  ON vana_linked_wallets (provider, provider_wallet_id);

CREATE TABLE IF NOT EXISTS vana_provider_links (
  id              TEXT PRIMARY KEY,            -- vana_plink_<random>
  vana_user_id    TEXT NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,               -- 'privy', 'google', 'apple', ...
  provider_subject TEXT NOT NULL,              -- provider-issued user id / sub
  email           TEXT,                        -- audit metadata only, NOT a merge key
  metadata        JSONB,                       -- provider-specific evidence blob
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS vana_provider_links_user_idx
  ON vana_provider_links (vana_user_id);
