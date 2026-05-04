/**
 * Execute a real grant via the user's Personal Server.
 *
 * Replaces the mock-only path for `execution_mode === "embedded_wallet_account_hosted"`:
 *   1. Resolve the user's PS row (vana_user_id → linked wallet → personal_servers)
 *   2. Resolve the OIDC client to a registered builder (oauth_clients)
 *   3. Obtain a short-lived access_token via OAuth2 client_credentials
 *      against the PS's `/oauth/token` endpoint, using the PS row's stored
 *      control-plane secret (PS_ACCESS_TOKEN) as the client_secret.
 *   4. POST <ps-url>/v1/grants with Authorization: Bearer <access_token>
 *      and { granteeAddress, scopes, expiresAt?, nonce? }
 *   5. Return the grantId for the action result + consent event
 *
 * Tokens are cached per-PS-URL with the standard "refresh-30s-before-expiry"
 * policy and refreshed on 401. This is the SLVP-style two-tier model:
 *   PS_ACCESS_TOKEN (long-lived secret, never sent on per-request paths)
 *     → access_token (short-lived bearer, sent on every grant call)
 *
 * Tests inject the resolvers + http fetch as deps so this is pure.
 */

import * as oauth from "oauth4webapi";
import type { OauthClientRow } from "@/lib/db/oauth-clients";

export type ExecuteGrantInput = {
  vanaUserId: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  nonce?: number;
  /** Resolves the user's running Personal Server (or null if none). */
  resolvePersonalServer: (vanaUserId: string) => Promise<{
    serverId: string;
    serverUrl: string;
    /**
     * The PS's long-lived control-plane secret (PS_ACCESS_TOKEN).
     * Used as the OAuth2 `client_secret` in the client_credentials grant
     * against the PS's `/oauth/token` endpoint. Never sent as a Bearer.
     */
    controlPlaneSecret: string;
  } | null>;
  /** Resolves the OAuth client record. Builder fields may be null. */
  resolveOauthClient: (clientId: string) => Promise<OauthClientRow | null>;
  /** Injectable HTTP fetch (default: global fetch). */
  fetchImpl?: typeof fetch;
  /** Optional clock seam for tests. Returns ms since epoch. */
  now?: () => number;
};

export type ExecuteGrantResult =
  | {
      ok: true;
      grantId: string;
      granteeAddress: string;
      personalServer: { serverId: string; serverUrl: string };
    }
  | {
      ok: false;
      code:
        | "no_personal_server"
        | "client_not_found"
        | "client_no_builder"
        | "ps_unreachable"
        | "ps_token_failed"
        | "ps_rejected"
        | "no_grant_id";
      message: string;
    };

type CachedToken = {
  accessToken: string;
  /** ms since epoch when the token expires. */
  expiresAtMs: number;
};

/**
 * Per-PS-URL token cache. The Lambda runtime is not guaranteed to be a
 * single process, so this cache is best-effort: a token may be re-issued
 * on a fresh container, but the PS endpoint is idempotent on issuance and
 * tolerates the extra round-trip.
 */
const tokenCache = new Map<string, CachedToken>();

const TOKEN_REFRESH_SAFETY_SECONDS = 30;

/**
 * Obtain (and cache) an access token via the OAuth2 client_credentials
 * grant against `<serverUrl>/oauth/token`. Refresh ahead of expiry by
 * {@link TOKEN_REFRESH_SAFETY_SECONDS}.
 */
async function getAccessToken(input: {
  serverUrl: string;
  controlPlaneSecret: string;
  fetchImpl: typeof fetch;
  now: () => number;
  forceRefresh?: boolean;
}): Promise<string> {
  const cached = tokenCache.get(input.serverUrl);
  if (
    !input.forceRefresh &&
    cached &&
    cached.expiresAtMs > input.now() + TOKEN_REFRESH_SAFETY_SECONDS * 1000
  ) {
    return cached.accessToken;
  }

  const issuer = new URL(input.serverUrl);
  const as: oauth.AuthorizationServer = {
    issuer: issuer.origin,
    token_endpoint: `${issuer.origin}/oauth/token`,
  };
  const client: oauth.Client = {
    client_id: "control-plane",
    token_endpoint_auth_method: "client_secret_basic",
  };
  const clientAuth = oauth.ClientSecretBasic(input.controlPlaneSecret);

  const response = await oauth.clientCredentialsGrantRequest(
    as,
    client,
    clientAuth,
    new URLSearchParams(),
    { [oauth.customFetch]: input.fetchImpl },
  );
  const result = await oauth.processClientCredentialsResponse(
    as,
    client,
    response,
  );

  const accessToken =
    typeof result.access_token === "string" ? result.access_token : null;
  if (!accessToken) {
    throw new Error("OAuth2 token response missing access_token");
  }
  const expiresInSeconds =
    typeof result.expires_in === "number" ? result.expires_in : 3600;
  tokenCache.set(input.serverUrl, {
    accessToken,
    expiresAtMs: input.now() + expiresInSeconds * 1000,
  });
  return accessToken;
}

export async function executeGrantViaPersonalServer(
  input: ExecuteGrantInput,
): Promise<ExecuteGrantResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => Date.now());

  // 1. Resolve PS for the user.
  const ps = await input.resolvePersonalServer(input.vanaUserId);
  if (!ps) {
    return {
      ok: false,
      code: "no_personal_server",
      message:
        "User has no running Personal Server; provision one before approving real grants.",
    };
  }

  // 2. Resolve OAuth client + builder identity.
  const client = await input.resolveOauthClient(input.clientId);
  if (!client) {
    return {
      ok: false,
      code: "client_not_found",
      message: `OAuth client ${input.clientId} is not registered.`,
    };
  }
  if (!client.grantee_address || !client.builder_id) {
    return {
      ok: false,
      code: "client_no_builder",
      message: `OAuth client ${input.clientId} has no on-chain builder identity; cannot mint a real grant.`,
    };
  }

  // 3. Obtain (or reuse) an access token via OAuth2 client_credentials.
  const submitGrant = async (accessToken: string): Promise<Response> => {
    return fetchImpl(`${ps.serverUrl}/v1/grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        granteeAddress: client.grantee_address,
        scopes: input.scopes,
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt }
          : {}),
        ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
      }),
    });
  };

  let accessToken: string;
  try {
    accessToken = await getAccessToken({
      serverUrl: ps.serverUrl,
      controlPlaneSecret: ps.controlPlaneSecret,
      fetchImpl,
      now,
    });
  } catch (err) {
    return {
      ok: false,
      code: "ps_token_failed",
      message:
        err instanceof Error
          ? `Failed to obtain access token from PS: ${err.message}`
          : "Failed to obtain access token from PS",
    };
  }

  // 4. POST /v1/grants. On 401, refresh the token once and retry — handles
  // the case where the cached token was revoked or expired faster than its
  // declared TTL (PS supports server-side revocation).
  let res: Response;
  try {
    res = await submitGrant(accessToken);
    if (res.status === 401) {
      const refreshed = await getAccessToken({
        serverUrl: ps.serverUrl,
        controlPlaneSecret: ps.controlPlaneSecret,
        fetchImpl,
        now,
        forceRefresh: true,
      });
      res = await submitGrant(refreshed);
    }
  } catch (err) {
    return {
      ok: false,
      code: "ps_unreachable",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } }).error?.message ??
      `Personal Server returned ${res.status}`;
    return { ok: false, code: "ps_rejected", message };
  }
  const body = (await res.json()) as { grantId?: string };
  if (!body.grantId) {
    return {
      ok: false,
      code: "no_grant_id",
      message: "Personal Server did not return a grantId",
    };
  }

  return {
    ok: true,
    grantId: body.grantId,
    granteeAddress: client.grantee_address,
    personalServer: { serverId: ps.serverId, serverUrl: ps.serverUrl },
  };
}

/** Test-only: clears the per-PS-URL access-token cache. */
export function clearAccessTokenCacheForTests() {
  tokenCache.clear();
}
