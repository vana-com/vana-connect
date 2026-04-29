-- Account-hosted action requests, results, and consent events.
--
-- These tables back the request/result/code-exchange flow described in the
-- account-oidc-privy-actions design (D6, D7, D10, D11). They are intentionally
-- separate from the existing CLI device_codes/sessions tables and from
-- OIDC tokens: an OIDC id token does not by itself authorize reading user
-- data, and a separate action request/result/code-exchange flow gates every
-- account-hosted data action.
--
-- First implementation slice persists `mock` execution mode and `mock`
-- result mode only. Other enum values are present in CHECK constraints so
-- the model is forward-compatible without a schema change for the next
-- slice. Raw user data MUST NOT be written into action_results.result_payload
-- or any redirect parameter. Mock results carry only a fixed non-user-data
-- marker payload; non-mock results carry an `encrypted_bundle_reference`
-- (or future-safe equivalent) plus a separate short-lived reference.

CREATE TABLE IF NOT EXISTS account_action_requests (
  id                      TEXT PRIMARY KEY,           -- vana_areq_<random>
  client_id               TEXT NOT NULL,              -- registered OAuth client / app id
  vana_user_id            TEXT REFERENCES vana_users(id) ON DELETE SET NULL,
  action_type             TEXT NOT NULL,              -- e.g. 'memory.read', 'mock.echo'
  execution_mode          TEXT NOT NULL,
  result_mode             TEXT NOT NULL,
  requested_data          JSONB NOT NULL,             -- scopes/streams/fields/purpose/time range
  redirect_uri            TEXT NOT NULL,
  state_hash              TEXT,                       -- hash of client-supplied state, never raw state
  status                  TEXT NOT NULL DEFAULT 'pending',
  display_metadata        JSONB,                      -- title/description shown to user
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL,
  decided_at              TIMESTAMPTZ,
  CHECK (id LIKE 'vana_areq_%'),
  CHECK (state_hash IS NULL OR state_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > created_at),
  CHECK (decided_at IS NULL OR decided_at >= created_at),
  CHECK (execution_mode IN ('mock', 'embedded_wallet_account_hosted', 'byo_wallet_client_signed', 'delegated_runtime')),
  CHECK (result_mode IN ('mock', 'encrypted_bundle_reference')),
  CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed'))
);

CREATE INDEX IF NOT EXISTS account_action_requests_client_idx
  ON account_action_requests (client_id);

CREATE INDEX IF NOT EXISTS account_action_requests_user_idx
  ON account_action_requests (vana_user_id);

CREATE INDEX IF NOT EXISTS account_action_requests_status_idx
  ON account_action_requests (status, expires_at);

CREATE TABLE IF NOT EXISTS account_action_results (
  id                      TEXT PRIMARY KEY,           -- vana_ares_<random>
  action_request_id       TEXT NOT NULL REFERENCES account_action_requests(id) ON DELETE CASCADE,
  client_id               TEXT NOT NULL,              -- duplicated for client-binding checks
  action_code_hash        TEXT NOT NULL UNIQUE,       -- hash of single-use action_code; raw code is never stored
  result_mode             TEXT NOT NULL,
  -- Mock result payload. For non-mock result modes, this column MUST stay NULL
  -- and `result_reference` must point to an encrypted bundle (or future-safe
  -- short-lived reference). This is enforced by the CHECK constraint below
  -- and by the application-level helpers in account-action.ts.
  result_payload          JSONB,
  result_reference        TEXT,                       -- e.g. opaque ref to encrypted bundle in a separate store
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL,
  consumed_at             TIMESTAMPTZ,
  CHECK (id LIKE 'vana_ares_%'),
  CHECK (action_code_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (result_mode IN ('mock', 'encrypted_bundle_reference')),
  CHECK (
    (result_mode = 'mock' AND result_payload IS NOT NULL AND result_reference IS NULL)
    OR (result_mode <> 'mock' AND result_payload IS NULL AND result_reference IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS account_action_results_request_idx
  ON account_action_results (action_request_id);

CREATE INDEX IF NOT EXISTS account_action_results_expiry_idx
  ON account_action_results (expires_at);

-- Consent / action events. First DP RPC-compatible seam. Field set mirrors
-- design.md D11 so later slices can stream these to DP RPC or L1 anchoring
-- without a schema migration.
CREATE TABLE IF NOT EXISTS account_consent_events (
  id                      TEXT PRIMARY KEY,           -- vana_evt_<random>
  schema_version          INTEGER NOT NULL,
  event_type              TEXT NOT NULL,
  occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  issuer                  TEXT NOT NULL,              -- e.g. 'account.vana.org'
  vana_user_id            TEXT REFERENCES vana_users(id) ON DELETE SET NULL,
  subject_wallet_address  TEXT,
  client_id               TEXT NOT NULL,
  application_id          TEXT,
  protocol_principal      JSONB,                      -- nullable: builder/grantee/app principal
  action_request_id       TEXT REFERENCES account_action_requests(id) ON DELETE SET NULL,
  action_type             TEXT NOT NULL,
  requested_data          JSONB NOT NULL,
  decision                TEXT,                       -- 'approved' | 'denied' | NULL for non-decision events
  execution_mode          TEXT NOT NULL,
  result_mode             TEXT NOT NULL,
  authorization_reference JSONB,                      -- nullable: future grant_id/permission_id/file ids/action code hash
  idempotency_key         TEXT NOT NULL,
  request_hash            TEXT NOT NULL,
  audit_metadata          JSONB,
  CHECK (id LIKE 'vana_evt_%'),
  CHECK (schema_version > 0),
  CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  CHECK (event_type IN ('action.requested', 'action.approved', 'action.denied', 'action.completed', 'action.exchanged', 'action.expired')),
  CHECK (execution_mode IN ('mock', 'embedded_wallet_account_hosted', 'byo_wallet_client_signed', 'delegated_runtime')),
  CHECK (result_mode IN ('mock', 'encrypted_bundle_reference')),
  CHECK (decision IS NULL OR decision IN ('approved', 'denied')),
  UNIQUE (event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS account_consent_events_user_idx
  ON account_consent_events (vana_user_id);

CREATE INDEX IF NOT EXISTS account_consent_events_request_idx
  ON account_consent_events (action_request_id);

CREATE INDEX IF NOT EXISTS account_consent_events_type_time_idx
  ON account_consent_events (event_type, occurred_at);
