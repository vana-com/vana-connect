/**
 * Headless OIDC flow driver against Ory Hydra.
 *
 * Used by `/api/auth/session` to mint a Vana session token from a verified
 * Privy id_token + resolved `vanaUserId` without a browser round-trip.
 *
 * This is the BFF (backend-for-frontend) pattern adapted for Hydra: we
 * programmatically drive the authorization-code + PKCE flow server-side,
 * accepting login + consent challenges via the admin API, capturing the
 * resulting code from the redirect URL, and exchanging at the token
 * endpoint.
 *
 * See docs/auth-redesign/01-architecture.md §3.3.
 *
 * Caller controls everything Hydra needs to know:
 *   - vanaUserId (the OIDC subject)
 *   - audience (defaults to ['account.vana.org'])
 *   - scope (defaults to ['openid', 'offline'])
 *   - clientId (defaults to 'vana-account-web')
 *
 * Returns the raw token response from Hydra:
 *   { access_token, refresh_token, expires_in, id_token? }
 *
 * Network model: 4 server-side requests to Hydra (auth → admin login →
 * admin consent → token). The admin requests are authenticated via
 * Google ID-token Bearer (Cloud Run IAM); the public-facing requests
 * are unauthenticated.
 *
 * PKCE is mandatory. The client_id is registered with
 * token_endpoint_auth_method=none so we MUST present the code_verifier
 * at token-exchange time — Hydra will reject a malformed code without
 * it.
 */

import { createHash, randomBytes } from "node:crypto";
import { fetchGoogleIdTokenForAudience } from "./google-id-token";

type VanaUserId = string;

export type HydraTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

export type HeadlessOidcInput = {
  vanaUserId: VanaUserId;
  /** Hydra OAuth client id, e.g. 'vana-account-web' or 'data-connect'. */
  clientId: string;
  /** Defaults to ['account.vana.org']. */
  audience?: string[];
  /** Defaults to ['openid', 'offline']. */
  scope?: string[];
  /** Override for tests. */
  fetch?: typeof fetch;
  /** Override for tests. */
  hydraPublicUrl?: string;
  /** Override for tests. */
  hydraAdminUrl?: string;
  /** Override for tests. */
  hydraAdminAudience?: string;
  /**
   * Pre-registered redirect URI on the OAuth client. Hydra requires this
   * even though we don't actually browse it. Defaults to
   * `${hydraPublicUrl}/oauth2/headless-callback` which is intentionally
   * fictional — Hydra accepts the URL as long as it's in the client's
   * `redirect_uris` allowlist; we capture the redirect at fetch level.
   *
   * For the live `vana-account-web` client this is
   * `https://account-dev.vana.org/auth/oidc/callback`.
   */
  redirectUri?: string;
};

export class HydraHeadlessError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly body?: string;
  constructor(code: string, message: string, status?: number, body?: string) {
    super(message);
    this.name = "HydraHeadlessError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 7636: code_verifier = high-entropy random; code_challenge = base64url(sha256(verifier)). */
function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(
    createHash("sha256").update(verifier, "ascii").digest(),
  );
  return { verifier, challenge };
}

/** Extract a query param from a URL (string or already-URL). */
function param(urlOrPath: string, name: string): string | null {
  // Handle relative URLs (Hydra sometimes redirects to a path-only Location).
  let u: URL;
  try {
    u = new URL(urlOrPath);
  } catch {
    u = new URL(urlOrPath, "https://placeholder.local");
  }
  return u.searchParams.get(name);
}

async function adminBearer(
  hydraAdminAudience: string,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const tok = await fetchGoogleIdTokenForAudience(hydraAdminAudience, {
    fetch: fetchImpl,
  });
  if (!tok) {
    throw new HydraHeadlessError(
      "admin_bearer_unavailable",
      "Could not mint Google ID token for Hydra admin",
    );
  }
  return tok;
}

/**
 * Drive the OAuth2 authorization-code flow + PKCE end-to-end against Hydra.
 * Returns the token response, or throws HydraHeadlessError.
 */
export async function exchangeForVanaSession(
  input: HeadlessOidcInput,
): Promise<HydraTokenResponse> {
  const fetchImpl = input.fetch ?? fetch;
  const hydraPublic =
    input.hydraPublicUrl ??
    process.env.HYDRA_PUBLIC_URL ??
    "https://oauth-dev.vana.org";
  const hydraAdmin =
    input.hydraAdminUrl ??
    process.env.HYDRA_ADMIN_URL ??
    "https://oauth-admin-dev.vana.org";
  const hydraAdminAud =
    input.hydraAdminAudience ?? process.env.HYDRA_ADMIN_AUDIENCE ?? hydraAdmin;
  const audience = input.audience ?? ["account.vana.org"];
  const scope = input.scope ?? ["openid", "offline"];
  // The redirect URI must be in the client's allowlist. The vana-account-web
  // client lists https://account-dev.vana.org/auth/oidc/callback — we use
  // that here, even though we never actually browse to it (we capture the
  // redirect at fetch level).
  const redirectUri =
    input.redirectUri ?? "https://account-dev.vana.org/auth/oidc/callback";

  const pkce = makePkcePair();
  const state = base64UrlEncode(randomBytes(16));
  const nonce = base64UrlEncode(randomBytes(16));

  // 1. GET /oauth2/auth → Hydra redirects to login UI with login_challenge.
  const authUrl = new URL(`${hydraPublic.replace(/\/+$/, "")}/oauth2/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", input.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (audience.length > 0) {
    authUrl.searchParams.set("audience", audience.join(" "));
  }

  const authRes = await fetchImpl(authUrl.toString(), {
    method: "GET",
    redirect: "manual",
  });
  if (authRes.status !== 302 && authRes.status !== 303) {
    throw new HydraHeadlessError(
      "auth_no_redirect",
      `expected redirect from /oauth2/auth, got ${authRes.status}`,
      authRes.status,
      await authRes.text().catch(() => ""),
    );
  }
  const loginLocation = authRes.headers.get("location");
  if (!loginLocation) {
    throw new HydraHeadlessError(
      "auth_missing_location",
      "Hydra /oauth2/auth redirect missing Location header",
    );
  }
  const loginChallenge = param(loginLocation, "login_challenge");
  if (!loginChallenge) {
    // If Hydra returned an error redirect, surface it.
    const error = param(loginLocation, "error");
    throw new HydraHeadlessError(
      "auth_no_login_challenge",
      `Hydra redirected without login_challenge: ${loginLocation}`,
      undefined,
      error ?? loginLocation,
    );
  }

  const adminTok = await adminBearer(hydraAdminAud, fetchImpl);

  // 2. PUT /admin/oauth2/auth/requests/login/accept — accept the login as vanaUserId.
  const acceptLoginRes = await fetchImpl(
    `${hydraAdmin.replace(/\/+$/, "")}/admin/oauth2/auth/requests/login/accept?login_challenge=${encodeURIComponent(loginChallenge)}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${adminTok}`,
      },
      body: JSON.stringify({
        subject: input.vanaUserId,
        remember: false,
        remember_for: 0,
      }),
    },
  );
  if (!acceptLoginRes.ok) {
    throw new HydraHeadlessError(
      "accept_login_failed",
      `accept_login returned ${acceptLoginRes.status}`,
      acceptLoginRes.status,
      await acceptLoginRes.text().catch(() => ""),
    );
  }
  const acceptLoginBody = (await acceptLoginRes.json()) as {
    redirect_to?: string;
  };
  if (!acceptLoginBody.redirect_to) {
    throw new HydraHeadlessError(
      "accept_login_no_redirect_to",
      "accept_login response missing redirect_to",
    );
  }

  // 3. GET the accept-login redirect — Hydra responds with another redirect carrying consent_challenge.
  const consentRedirectRes = await fetchImpl(acceptLoginBody.redirect_to, {
    method: "GET",
    redirect: "manual",
  });
  if (consentRedirectRes.status !== 302 && consentRedirectRes.status !== 303) {
    throw new HydraHeadlessError(
      "consent_no_redirect",
      `expected redirect after accept_login, got ${consentRedirectRes.status}`,
      consentRedirectRes.status,
      await consentRedirectRes.text().catch(() => ""),
    );
  }
  const consentLocation = consentRedirectRes.headers.get("location");
  if (!consentLocation) {
    throw new HydraHeadlessError(
      "consent_missing_location",
      "redirect after accept_login missing Location",
    );
  }
  const consentChallenge = param(consentLocation, "consent_challenge");
  if (!consentChallenge) {
    // Could be the final code-bearing redirect (consent skipped via
    // skip=true on the consent request — Hydra only does this when a
    // prior consent was remembered). For our flow, audience + scope grant
    // are issued each time, so this branch is unexpected.
    const code = param(consentLocation, "code");
    if (code) {
      // Edge: consent was skipped; jump to step 5.
      return await tokenExchange({
        hydraPublic,
        clientId: input.clientId,
        code,
        redirectUri,
        codeVerifier: pkce.verifier,
        fetchImpl,
      });
    }
    throw new HydraHeadlessError(
      "consent_no_challenge",
      `redirect after accept_login carried no consent_challenge or code: ${consentLocation}`,
    );
  }

  // 4. PUT /admin/oauth2/auth/requests/consent/accept — grant the requested scope + audience.
  const acceptConsentRes = await fetchImpl(
    `${hydraAdmin.replace(/\/+$/, "")}/admin/oauth2/auth/requests/consent/accept?consent_challenge=${encodeURIComponent(consentChallenge)}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${adminTok}`,
      },
      body: JSON.stringify({
        grant_scope: scope,
        grant_access_token_audience: audience,
        remember: false,
        remember_for: 0,
        // Custom claims (vana_user_id is already the subject; we keep
        // the access_token claim bag empty for now — verifier reads
        // from `sub`).
        session: {
          access_token: {},
          id_token: { vana_user_id: input.vanaUserId },
        },
      }),
    },
  );
  if (!acceptConsentRes.ok) {
    throw new HydraHeadlessError(
      "accept_consent_failed",
      `accept_consent returned ${acceptConsentRes.status}`,
      acceptConsentRes.status,
      await acceptConsentRes.text().catch(() => ""),
    );
  }
  const acceptConsentBody = (await acceptConsentRes.json()) as {
    redirect_to?: string;
  };
  if (!acceptConsentBody.redirect_to) {
    throw new HydraHeadlessError(
      "accept_consent_no_redirect_to",
      "accept_consent response missing redirect_to",
    );
  }

  // 5. GET the accept-consent redirect — Hydra responds with a redirect to redirect_uri with the code.
  const codeRedirectRes = await fetchImpl(acceptConsentBody.redirect_to, {
    method: "GET",
    redirect: "manual",
  });
  if (codeRedirectRes.status !== 302 && codeRedirectRes.status !== 303) {
    throw new HydraHeadlessError(
      "code_no_redirect",
      `expected final redirect, got ${codeRedirectRes.status}`,
      codeRedirectRes.status,
      await codeRedirectRes.text().catch(() => ""),
    );
  }
  const codeLocation = codeRedirectRes.headers.get("location");
  if (!codeLocation) {
    throw new HydraHeadlessError(
      "code_missing_location",
      "final redirect missing Location",
    );
  }
  const code = param(codeLocation, "code");
  if (!code) {
    throw new HydraHeadlessError(
      "code_not_present",
      `final redirect carried no code: ${codeLocation}`,
    );
  }
  const returnedState = param(codeLocation, "state");
  if (returnedState !== state) {
    throw new HydraHeadlessError(
      "state_mismatch",
      "state parameter on final redirect does not match issued state",
    );
  }

  // 6. POST /oauth2/token with the code + PKCE verifier.
  return await tokenExchange({
    hydraPublic,
    clientId: input.clientId,
    code,
    redirectUri,
    codeVerifier: pkce.verifier,
    fetchImpl,
  });
}

async function tokenExchange(args: {
  hydraPublic: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl: typeof fetch;
}): Promise<HydraTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const tokenRes = await args.fetchImpl(
    `${args.hydraPublic.replace(/\/+$/, "")}/oauth2/token`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );
  if (!tokenRes.ok) {
    throw new HydraHeadlessError(
      "token_exchange_failed",
      `token endpoint returned ${tokenRes.status}`,
      tokenRes.status,
      await tokenRes.text().catch(() => ""),
    );
  }
  return (await tokenRes.json()) as HydraTokenResponse;
}
