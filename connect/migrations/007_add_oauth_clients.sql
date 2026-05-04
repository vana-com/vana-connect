-- Persistent registry of OAuth clients (apps that integrate Sign in with Vana
-- and/or initiate account-hosted action requests). Replaces the localStorage
-- admin store, which was browser-local and not survivable.
--
-- Optional builder binding: pure identity consumers (Sign in with Vana that
-- never request data) do not need on-chain builder identity, so
-- grantee_address / builder_id / public_key are nullable. Clients that DO
-- request data must populate them so the action-decision flow can mint a
-- real grant on the user's Personal Server.
--
-- application_id is a stable, app-friendly identifier (free-form short
-- string) that the action-decision flow stamps onto consent events for
-- audit. If null, account-action handlers fall back to client_id.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id        TEXT PRIMARY KEY,
  application_id   TEXT,
  display_name     TEXT NOT NULL,
  app_url          TEXT NOT NULL,
  owner_address    TEXT NOT NULL,                                       -- the registrant's wallet
  grantee_address  TEXT,                                                -- on-chain builder address; NULL for identity-only clients
  builder_id       TEXT,                                                -- on-chain builder id (bytes32 hex)
  public_key       TEXT,                                                -- builder public key, 0x04-prefixed uncompressed
  webhook_url      TEXT,
  redirect_uris    JSONB NOT NULL DEFAULT '[]'::jsonb,                  -- allowed OIDC redirect URIs
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (length(display_name) > 0),
  CHECK (app_url ~ '^https?://'),
  CHECK (owner_address ~ '^0x[a-fA-F0-9]{40}$'),
  CHECK (grantee_address IS NULL OR grantee_address ~ '^0x[a-fA-F0-9]{40}$'),
  CHECK (builder_id IS NULL OR builder_id ~ '^0x[a-fA-F0-9]{64}$'),
  CHECK (public_key IS NULL OR public_key ~ '^0x04[a-fA-F0-9]{128}$'),
  -- Real-grant readiness is all-or-nothing: any builder field requires the
  -- others, so the action-decision flow can rely on a populated triple.
  CHECK (
    (grantee_address IS NULL AND builder_id IS NULL AND public_key IS NULL)
    OR (grantee_address IS NOT NULL AND builder_id IS NOT NULL AND public_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS oauth_clients_grantee_idx
  ON oauth_clients (grantee_address);

CREATE INDEX IF NOT EXISTS oauth_clients_owner_idx
  ON oauth_clients (owner_address);
