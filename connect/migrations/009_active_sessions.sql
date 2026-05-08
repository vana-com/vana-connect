-- Vana auth — active OIDC sessions.
--
-- Hydra v2 access tokens are opaque; introspection (RFC 7662) does not
-- include `sid` or `jti`. The signing-authority plane (signing_authorizations,
-- interactive_confirmations) is keyed by hydra_session_id, which must remain
-- stable across access-token rotation.
--
-- We capture `sid` from the OIDC id_token at login (OIDC Core requires `sid`
-- in id_token when `openid` scope is requested) and store it server-side
-- keyed by sha256(access_token) so the session verifier can resolve sid on
-- every introspection without trusting the client.
--
-- Token storage rule: the access token is stored as sha256(access_token) in
-- hex. The verifier hashes the presented token with the same function for
-- lookup; the raw token is never persisted.
--
-- Tombstone scaffolding (vana_session_tombstones) is removed by
-- 010_drop_session_tombstones.sql once this active-session path is live.

CREATE TABLE IF NOT EXISTS vana_active_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      TEXT NOT NULL UNIQUE,        -- sha256(access_token), hex
    sid             TEXT NOT NULL,               -- OIDC sid from id_token
    vana_user_id    TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,        -- mirrors access_token exp
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vana_active_sessions_sid ON vana_active_sessions (sid);
CREATE INDEX IF NOT EXISTS idx_vana_active_sessions_user ON vana_active_sessions (vana_user_id);
CREATE INDEX IF NOT EXISTS idx_vana_active_sessions_expires ON vana_active_sessions (expires_at);
