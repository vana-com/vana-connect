CREATE TABLE IF NOT EXISTS device_codes (
  device_code   TEXT PRIMARY KEY,
  user_code     TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | authorized | expired
  wallet_address TEXT,
  session_token TEXT,
  last_polled_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,  -- vana_sess_...
  wallet_address TEXT NOT NULL,
  ps_access_token TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

-- Add access_token column to personal_servers
ALTER TABLE personal_servers ADD COLUMN IF NOT EXISTS access_token TEXT;
