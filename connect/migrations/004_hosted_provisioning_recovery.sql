ALTER TABLE personal_servers
  ADD COLUMN IF NOT EXISTS provisioning_step TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compute_operation TEXT,
  ADD COLUMN IF NOT EXISTS compute_creation_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleanup_claim UUID,
  ADD COLUMN IF NOT EXISTS cleanup_expires_at TIMESTAMPTZ;

-- Older deployments can share this database. They cannot delete a journaled
-- attempt or a row whose cleanup is claimed by the new runtime.
CREATE OR REPLACE FUNCTION guard_personal_server_recovery()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provisioning_step IS NOT NULL
     OR OLD.compute_operation IS NOT NULL
     OR OLD.cleanup_claim IS NOT NULL THEN
    RAISE EXCEPTION 'Hosted server cleanup must be confirmed before removing its record';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_personal_server_recovery ON personal_servers;
CREATE TRIGGER guard_personal_server_recovery
BEFORE DELETE ON personal_servers
FOR EACH ROW EXECUTE FUNCTION guard_personal_server_recovery();

CREATE OR REPLACE FUNCTION remove_cleaned_personal_server(server_id text, claim_id uuid)
RETURNS TABLE(id text) LANGUAGE plpgsql AS $$
BEGIN
  UPDATE personal_servers AS server
  SET provisioning_step = NULL, compute_operation = NULL, cleanup_claim = NULL
  WHERE server.id = server_id AND server.cleanup_claim = claim_id
    AND server.cleanup_expires_at > now();

  IF FOUND THEN
    RETURN QUERY DELETE FROM personal_servers AS server
    WHERE server.id = server_id RETURNING server.id;
  END IF;
END;
$$;
