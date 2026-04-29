/**
 * OAuth client registry and consent policy guardrail.
 *
 * The first slice intentionally uses a static, code-defined client registry
 * rather than dynamic storage. Hydra holds its own client records for OAuth
 * protocol behavior; this module sits in front of `handleOidcConsent` and
 * decides whether the scopes/audience Hydra is forwarding for a given
 * `client_id` are permitted by Vana policy.
 *
 * Helpers are pure so they can be tested without Hydra, the database, or
 * Next.js. A future migration to dynamic storage can swap
 * {@link createDefaultOauthClientRegistry} for a DB-backed implementation
 * without changing the consent route shape.
 */

export const OIDC_BASIC_SCOPES = ["openid", "profile", "email"] as const;
export type OidcBasicScope = (typeof OIDC_BASIC_SCOPES)[number];

export type OauthClientRecord = {
  /** Hydra `client_id`. Must match the registered Hydra client. */
  clientId: string;
  /** Display name shown on consent / action UI. */
  displayName: string;
  /** Allowlisted redirect URIs (exact match). */
  redirectUris: readonly string[];
  /** Allowlisted web origins for cross-origin requests. */
  allowedOrigins: readonly string[];
  /** Scopes Vana is willing to grant for this client. */
  allowedScopes: readonly string[];
  /** Audience identifiers Vana is willing to grant for this client. */
  allowedAudiences: readonly string[];
  /**
   * Optional reference to a future protocol/application principal (builder
   * address, grantee address, etc.). Intentionally optional in the first
   * slice: OIDC client identity is separate from protocol principals.
   */
  protocolPrincipal?: {
    kind: string;
    id: string;
  };
};

export type OauthClientRegistry = {
  resolve(clientId: string | null | undefined): OauthClientRecord | null;
  list(): readonly OauthClientRecord[];
};

/**
 * Static registry for the dev Memory App. The OIDC issuer (Hydra) and the
 * Memory App fixture both reference `client_id = "memory-app-dev"`.
 */
export const DEV_MEMORY_APP_CLIENT: OauthClientRecord = {
  clientId: "memory-app-dev",
  displayName: "Memory App (dev)",
  redirectUris: [
    "http://localhost:3000/api/auth/callback/vana",
    "http://localhost:3001/api/auth/callback/vana",
  ],
  allowedOrigins: ["http://localhost:3000", "http://localhost:3001"],
  allowedScopes: ["openid", "profile", "email", "offline_access"],
  allowedAudiences: ["memory-app-dev"],
};

const DEFAULT_CLIENTS: readonly OauthClientRecord[] = [DEV_MEMORY_APP_CLIENT];

/**
 * Build an in-memory registry from a list of client records. Defaults to the
 * first-slice client set when no override is provided.
 */
export function createDefaultOauthClientRegistry(
  clients: readonly OauthClientRecord[] = DEFAULT_CLIENTS,
): OauthClientRegistry {
  const byId = new Map<string, OauthClientRecord>();
  for (const client of clients) {
    byId.set(client.clientId, client);
  }
  return {
    resolve(clientId) {
      if (!clientId) return null;
      return byId.get(clientId) ?? null;
    },
    list() {
      return [...byId.values()];
    },
  };
}

export type ConsentPolicyDecision =
  | {
      kind: "allow";
      client: OauthClientRecord;
      grantScope: string[];
      grantAudience: string[];
    }
  | {
      kind: "deny";
      reason: ConsentDenialReason;
      message: string;
    };

export type ConsentDenialReason =
  | "unknown_client"
  | "disallowed_scope"
  | "disallowed_audience";

export type EvaluateConsentInput = {
  registry: OauthClientRegistry;
  clientId: string | null | undefined;
  requestedScope: readonly string[] | undefined;
  requestedAudience: readonly string[] | undefined;
};

/**
 * Decide whether a Hydra consent request can be accepted with the requested
 * scopes/audience. Filters out duplicates and empty entries before checking
 * against the client's allowlist.
 *
 * Returns `allow` with the filtered grant data on success, or `deny` with a
 * typed reason on failure. Callers must not pass requested scopes/audience to
 * Hydra unless this returns `allow`.
 */
export function evaluateConsentPolicy(
  input: EvaluateConsentInput,
): ConsentPolicyDecision {
  const client = input.registry.resolve(input.clientId);
  if (!client) {
    return {
      kind: "deny",
      reason: "unknown_client",
      message: `Unknown OAuth client: ${input.clientId ?? "<missing>"}`,
    };
  }

  const requestedScopes = normalizeList(input.requestedScope);
  const allowedScopes = new Set(client.allowedScopes);
  const disallowedScope = requestedScopes.find((s) => !allowedScopes.has(s));
  if (disallowedScope) {
    return {
      kind: "deny",
      reason: "disallowed_scope",
      message: `Scope not allowed for client ${client.clientId}: ${disallowedScope}`,
    };
  }

  const requestedAudience = normalizeList(input.requestedAudience);
  const allowedAudiences = new Set(client.allowedAudiences);
  const disallowedAudience = requestedAudience.find(
    (a) => !allowedAudiences.has(a),
  );
  if (disallowedAudience) {
    return {
      kind: "deny",
      reason: "disallowed_audience",
      message: `Audience not allowed for client ${client.clientId}: ${disallowedAudience}`,
    };
  }

  return {
    kind: "allow",
    client,
    grantScope: requestedScopes,
    grantAudience: requestedAudience,
  };
}

function normalizeList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
