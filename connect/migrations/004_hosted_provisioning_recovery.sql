ALTER TABLE personal_servers
  ADD COLUMN IF NOT EXISTS provisioning_step TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compute_operation TEXT,
  ADD COLUMN IF NOT EXISTS cleanup_claim UUID,
  ADD COLUMN IF NOT EXISTS cleanup_expires_at TIMESTAMPTZ;
