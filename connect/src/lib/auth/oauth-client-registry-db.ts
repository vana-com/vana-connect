/**
 * DB-backed implementation of {@link OauthClientRegistry}.
 *
 * Static `DEV_MEMORY_APP_CLIENT` is still injected as a fallback so the
 * dev/demo flow keeps working even when the `oauth_clients` table is empty.
 * Real registrations land in the table; the action-decision flow reads
 * builder identity (grantee_address, builder_id) from the DB to mint real
 * grants.
 */

import {
  findOauthClientById,
  hasBuilderIdentity,
  listOauthClients,
  type OauthClientRow,
} from "@/lib/db/oauth-clients";
import {
  DEV_MEMORY_APP_CLIENT,
  type OauthClientRecord,
  type OauthClientRegistry,
} from "./oauth-client-policy";

export type OauthClientWithBuilder = OauthClientRecord & {
  builder?: {
    granteeAddress: `0x${string}`;
    builderId: `0x${string}`;
    publicKey: string;
  };
};

function rowToRecord(row: OauthClientRow): OauthClientWithBuilder {
  const record: OauthClientWithBuilder = {
    clientId: row.client_id,
    displayName: row.display_name,
    redirectUris: row.redirect_uris,
    // No allowed-origins column on the DB row today: derive from registered
    // redirect URIs so consent policy doesn't reject legitimate cross-origin
    // calls. Admin UI can add an explicit column later if origins ever need
    // to diverge.
    allowedOrigins: deriveAllowedOrigins(row.redirect_uris),
    // First-slice OIDC scope/audience policy still lives in code; clients
    // get the same conservative allowlist as the dev fixture.
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    allowedAudiences: [row.client_id],
    protocolPrincipal:
      row.grantee_address !== null
        ? { kind: "builder", id: row.grantee_address }
        : undefined,
  };
  if (hasBuilderIdentity(row)) {
    record.builder = {
      granteeAddress: row.grantee_address as `0x${string}`,
      builderId: row.builder_id as `0x${string}`,
      publicKey: row.public_key as string,
    };
  }
  return record;
}

function deriveAllowedOrigins(redirectUris: string[]): string[] {
  const seen = new Set<string>();
  for (const uri of redirectUris) {
    try {
      const parsed = new URL(uri);
      seen.add(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // skip malformed
    }
  }
  return [...seen];
}

/**
 * DB-first registry. The `DEV_MEMORY_APP_CLIENT` fixture is included as a
 * fallback so the dev environment keeps working when the table is empty;
 * any DB row with the same `client_id` overrides the fallback.
 */
export function createDbOauthClientRegistry(options?: {
  fallbackClients?: readonly OauthClientRecord[];
}): OauthClientRegistry & {
  resolveAsync(
    clientId: string | null | undefined,
  ): Promise<OauthClientWithBuilder | null>;
  listAsync(): Promise<OauthClientWithBuilder[]>;
} {
  const fallbacks: ReadonlyMap<string, OauthClientRecord> = new Map(
    (options?.fallbackClients ?? [DEV_MEMORY_APP_CLIENT]).map((c) => [
      c.clientId,
      c,
    ]),
  );

  return {
    // Synchronous resolve falls back to the static map. Used by code paths
    // that cannot afford a DB hit (Hydra consent guard runs in a hot path).
    // For real-grant lookups, use resolveAsync.
    resolve(clientId) {
      if (!clientId) return null;
      return fallbacks.get(clientId) ?? null;
    },
    list() {
      return [...fallbacks.values()];
    },
    async resolveAsync(clientId) {
      if (!clientId) return null;
      try {
        const row = await findOauthClientById(clientId);
        if (row) return rowToRecord(row);
      } catch (err) {
        // Fall through to static fallback if DB is unreachable.
        console.error("oauth_clients DB lookup failed:", err);
      }
      const fallback = fallbacks.get(clientId);
      return fallback ? { ...fallback } : null;
    },
    async listAsync() {
      try {
        const rows = await listOauthClients();
        const merged = new Map<string, OauthClientWithBuilder>();
        for (const fallback of fallbacks.values()) {
          merged.set(fallback.clientId, { ...fallback });
        }
        for (const row of rows) {
          merged.set(row.client_id, rowToRecord(row));
        }
        return [...merged.values()];
      } catch (err) {
        console.error("oauth_clients DB list failed:", err);
        return [...fallbacks.values()].map((c) => ({ ...c }));
      }
    },
  };
}
