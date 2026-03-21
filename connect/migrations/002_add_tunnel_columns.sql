-- Add Cloudflare Tunnel columns for routing via tunnels instead of direct VM IP
ALTER TABLE personal_servers ADD COLUMN IF NOT EXISTS tunnel_id TEXT;
ALTER TABLE personal_servers ADD COLUMN IF NOT EXISTS dns_record_id TEXT;
