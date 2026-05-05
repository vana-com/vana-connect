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
    "http://localhost:3084/dev/login-with-vana",
    "http://localhost:3084/dev/login-with-vana/callback",
    "http://localhost:3084/demo/login-with-vana",
    "http://localhost:3084/demo/login-with-vana/callback",
    "https://vana-connect-mobile-dev.vercel.app/dev/login-with-vana",
    "https://vana-connect-mobile-dev.vercel.app/dev/login-with-vana/callback",
    "https://vana-connect-mobile-dev.vercel.app/demo/login-with-vana",
    "https://vana-connect-mobile-dev.vercel.app/demo/login-with-vana/callback",
  ],
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3084",
    "https://vana-connect-mobile-dev.vercel.app",
  ],
  allowedScopes: ["openid", "profile", "email", "offline_access"],
  allowedAudiences: ["memory-app-dev"],
};

/**
 * Static registry for the Vana data-connect desktop app. Public client (no
 * secret) using the OAuth 2.0 device authorization grant (RFC 8628). Hydra
 * registers it with `client_id="data-connect"`, scope `"openid offline"`,
 * audience `["account.vana.org"]`, and `token_endpoint_auth_method=none`.
 *
 * No redirectUris/allowedOrigins — the device flow does not use redirects;
 * the desktop app polls the token endpoint after the user approves on the
 * verification page. The redirect-URI / origin guards in this module are
 * not consulted on the device-grant path; they're for the auth-code flow.
 */
export const DATA_CONNECT_CLIENT: OauthClientRecord = {
  clientId: "data-connect",
  displayName: "Vana data-connect",
  redirectUris: [],
  allowedOrigins: [],
  allowedScopes: ["openid", "offline", "offline_access"],
  allowedAudiences: ["account.vana.org"],
};

const DEFAULT_CLIENTS: readonly OauthClientRecord[] = [
  DEV_MEMORY_APP_CLIENT,
  DATA_CONNECT_CLIENT,
];

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

export type RedirectUriDenialReason =
  | "missing_redirect_uri"
  | "malformed_redirect_uri"
  | "unregistered_redirect_uri";

export type OriginDenialReason =
  | "missing_origin"
  | "malformed_origin"
  | "unregistered_origin";

export type RedirectUriDecision =
  | { kind: "allow"; redirectUri: string }
  | { kind: "deny"; reason: RedirectUriDenialReason; message: string };

export type OriginDecision =
  | { kind: "allow"; origin: string }
  | { kind: "deny"; reason: OriginDenialReason; message: string };

/**
 * Decide whether a `redirect_uri` is permitted for the given client.
 *
 * Enforcement is exact-match against `client.redirectUris`. We deliberately do
 * not allow prefix or path-suffix matching: an OAuth client that registers
 * `https://app.example.com/cb` must not silently accept
 * `https://app.example.com/cb/../evil`. We also reject blank strings,
 * malformed URLs, protocol-relative inputs (e.g. `//evil`), and CRLF in the
 * raw value so callers cannot smuggle header injection into a redirect.
 *
 * Production-style origins must use `https`; `http` is permitted only for
 * `localhost`/`127.0.0.1` and only when the corresponding redirect URI is
 * already in the client's allowlist (via the exact-match check). This keeps
 * the dev Memory App localhost redirect URIs working while ensuring no
 * real-world `http://...` redirect can sneak past policy.
 */
export function checkRedirectUri(
  client: OauthClientRecord,
  rawRedirectUri: string | null | undefined,
): RedirectUriDecision {
  if (typeof rawRedirectUri !== "string") {
    return {
      kind: "deny",
      reason: "missing_redirect_uri",
      message: `Missing redirect_uri for client ${client.clientId}`,
    };
  }
  const trimmed = rawRedirectUri.trim();
  if (!trimmed) {
    return {
      kind: "deny",
      reason: "missing_redirect_uri",
      message: `Missing redirect_uri for client ${client.clientId}`,
    };
  }
  if (/[\r\n]/.test(rawRedirectUri)) {
    return {
      kind: "deny",
      reason: "malformed_redirect_uri",
      message: `Malformed redirect_uri for client ${client.clientId}`,
    };
  }
  if (trimmed.startsWith("//")) {
    return {
      kind: "deny",
      reason: "malformed_redirect_uri",
      message: `Malformed redirect_uri for client ${client.clientId}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      kind: "deny",
      reason: "malformed_redirect_uri",
      message: `Malformed redirect_uri for client ${client.clientId}`,
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      kind: "deny",
      reason: "malformed_redirect_uri",
      message: `Malformed redirect_uri for client ${client.clientId}`,
    };
  }

  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    return {
      kind: "deny",
      reason: "malformed_redirect_uri",
      message: `Insecure redirect_uri for client ${client.clientId}`,
    };
  }

  if (!client.redirectUris.includes(trimmed)) {
    return {
      kind: "deny",
      reason: "unregistered_redirect_uri",
      message: `Redirect URI not registered for client ${client.clientId}`,
    };
  }

  return { kind: "allow", redirectUri: trimmed };
}

/**
 * Decide whether an `Origin` (cross-origin request header) is permitted for
 * the given client. Like {@link checkRedirectUri}, this is exact-match against
 * `client.allowedOrigins`. We reject blanks, malformed URLs, anything with a
 * path/query/fragment (a bare origin must be `scheme://host[:port]`), CRLF,
 * and any non-`http(s)` scheme. `http` is allowed only for loopback hosts and
 * only when the exact origin is already on the allowlist.
 */
export function checkOrigin(
  client: OauthClientRecord,
  rawOrigin: string | null | undefined,
): OriginDecision {
  if (typeof rawOrigin !== "string") {
    return {
      kind: "deny",
      reason: "missing_origin",
      message: `Missing origin for client ${client.clientId}`,
    };
  }
  const trimmed = rawOrigin.trim();
  if (!trimmed) {
    return {
      kind: "deny",
      reason: "missing_origin",
      message: `Missing origin for client ${client.clientId}`,
    };
  }
  if (/[\r\n]/.test(rawOrigin)) {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Malformed origin for client ${client.clientId}`,
    };
  }
  if (trimmed.startsWith("//")) {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Malformed origin for client ${client.clientId}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Malformed origin for client ${client.clientId}`,
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Malformed origin for client ${client.clientId}`,
    };
  }

  // A serialized origin has no path, query, or fragment beyond a single
  // trailing slash that the URL parser may strip. Reject anything that adds
  // material beyond `scheme://host[:port]`.
  const expected = `${parsed.protocol}//${parsed.host}`;
  if (trimmed !== expected) {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Malformed origin for client ${client.clientId}`,
    };
  }

  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    return {
      kind: "deny",
      reason: "malformed_origin",
      message: `Insecure origin for client ${client.clientId}`,
    };
  }

  if (!client.allowedOrigins.includes(trimmed)) {
    return {
      kind: "deny",
      reason: "unregistered_origin",
      message: `Origin not registered for client ${client.clientId}`,
    };
  }

  return { kind: "allow", origin: trimmed };
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

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
