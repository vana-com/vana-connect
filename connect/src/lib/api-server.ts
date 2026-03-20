import type { PersonalServer } from "@/lib/db/neon";

export function toApiServer(row: PersonalServer) {
  return {
    object: "server" as const,
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    provider_id: row.provider_id,
    url: row.url,
    mcp_endpoint: row.url ? `${row.url}/mcp` : null,
    state: row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
