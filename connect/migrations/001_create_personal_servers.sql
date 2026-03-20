CREATE TABLE IF NOT EXISTS personal_servers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT UNIQUE NOT NULL,
  provider      TEXT NOT NULL,
  provider_id   TEXT,
  vm_ip         TEXT,
  url           TEXT,
  state         TEXT NOT NULL DEFAULT 'provisioning',
  disk_id       TEXT,
  disk_expires  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_servers_user_id ON personal_servers(user_id);
