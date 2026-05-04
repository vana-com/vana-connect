// OIDC relying-party fixture for the dev Memory App client.
//
// Pure, dependency-free module. Exports a single `RpFixture` source of
// truth and projects it into:
//
//   * an Auth.js v5 custom OIDC provider config
//     (consumable by `Auth({ providers: [...] })`)
//   * an openid-client discovery + client init pair
//     (consumable by `openid-client.discover` + `new Client(...)`)
//
// The companion vitest at
// `connect/src/lib/auth/oidc-rp-fixture.test.ts` imports this module
// directly and asserts its compatibility with the in-tree static
// `OauthClientRegistry`.
//
// Defaults target the local Hydra v26 POC because that is the only
// end-to-end OIDC issuer that Vana currently has running on a laptop;
// the production `account.vana.org` issuer is still gated by the
// issuer-shape decision in
// `openspec/changes/account-oidc-privy-actions/design.md` D1.

/**
 * @typedef {Object} RpFixture
 * @property {string} clientId
 * @property {string} clientName
 * @property {string} issuer
 * @property {string} redirectUri
 * @property {readonly string[]} scopes
 * @property {readonly string[]} audience
 * @property {"none"} tokenEndpointAuthMethod
 * @property {"S256"} codeChallengeMethod
 * @property {"public"} clientType
 */

const DEFAULT_ISSUER = "http://127.0.0.1:4444"; // Hydra v26 POC public URL
const DEFAULT_CLIENT_ID = "memory-app-dev";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/auth/callback/vana";
const DEFAULT_SCOPES = Object.freeze(["openid", "profile", "email"]);
const DEFAULT_AUDIENCE = Object.freeze(["memory-app-dev"]);

/**
 * Build the canonical fixture record. All fields are overridable so the
 * same fixture can target the Hydra POC today and a future
 * `account.vana.org` issuer without code edits.
 *
 * @param {Partial<RpFixture> & { env?: Record<string, string | undefined> }} [overrides]
 * @returns {RpFixture}
 */
export function buildRpFixture(overrides = {}) {
  const env = overrides.env ?? (typeof process !== "undefined" ? process.env : {});
  const fixture = {
    clientId: overrides.clientId ?? env.VANA_OIDC_CLIENT_ID ?? DEFAULT_CLIENT_ID,
    clientName: overrides.clientName ?? "Memory App (dev)",
    issuer: overrides.issuer ?? env.VANA_OIDC_ISSUER ?? DEFAULT_ISSUER,
    redirectUri:
      overrides.redirectUri ?? env.VANA_OIDC_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
    scopes: Object.freeze([...(overrides.scopes ?? DEFAULT_SCOPES)]),
    audience: Object.freeze([...(overrides.audience ?? DEFAULT_AUDIENCE)]),
    tokenEndpointAuthMethod: "none",
    codeChallengeMethod: "S256",
    clientType: "public",
  };
  return Object.freeze(fixture);
}

/**
 * Project the fixture into an Auth.js v5 custom OIDC provider config.
 * This is the object an Auth.js consumer would put inside
 * `providers: [...]`. The callback URL is intentionally not embedded in
 * the provider object; Auth.js derives it from the app origin and
 * provider id (`/api/auth/callback/vana`). The fixture records the expected
 * callback URL separately as `fixture.redirectUri`.
 *
 * @param {RpFixture} [fixture]
 */
export function buildAuthJsProvider(fixture = buildRpFixture()) {
  return {
    id: "vana",
    name: fixture.clientName,
    type: "oidc",
    issuer: fixture.issuer,
    clientId: fixture.clientId,
    // Public PKCE client -- no client_secret. Auth.js requires the
    // `client.token_endpoint_auth_method` override to actually omit
    // the secret on the token request.
    client: {
      token_endpoint_auth_method: fixture.tokenEndpointAuthMethod,
    },
    authorization: {
      params: {
        scope: fixture.scopes.join(" "),
        // Auth.js sets PKCE automatically for OIDC providers, but we
        // declare S256 explicitly so reviewers can see the intent.
        code_challenge_method: fixture.codeChallengeMethod,
        ...(fixture.audience.length > 0
          ? { audience: fixture.audience.join(" ") }
          : {}),
      },
    },
    checks: ["pkce", "state", "nonce"],
  };
}

/**
 * Project the fixture into the inputs an `openid-client` RP needs:
 * an issuer URL plus the client metadata used in `new Client(...)`.
 *
 * @param {RpFixture} [fixture]
 */
export function buildOpenIdClientInputs(fixture = buildRpFixture()) {
  return {
    discoveryUrl: `${trimTrailingSlash(fixture.issuer)}/.well-known/openid-configuration`,
    issuer: fixture.issuer,
    clientMetadata: {
      client_id: fixture.clientId,
      client_name: fixture.clientName,
      redirect_uris: [fixture.redirectUri],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: fixture.tokenEndpointAuthMethod,
      scope: fixture.scopes.join(" "),
    },
    authorizationParams: {
      scope: fixture.scopes.join(" "),
      code_challenge_method: fixture.codeChallengeMethod,
      ...(fixture.audience.length > 0
        ? { audience: fixture.audience.join(" ") }
        : {}),
    },
  };
}

/**
 * Project the fixture into the input shape that Vana's in-tree
 * `evaluateConsentPolicy` expects. Useful for the companion vitest:
 * the fixture should be allowed by the static policy.
 *
 * @param {RpFixture} [fixture]
 */
export function buildConsentPolicyInput(fixture = buildRpFixture()) {
  return {
    clientId: fixture.clientId,
    requestedScope: [...fixture.scopes],
    requestedAudience: [...fixture.audience],
    redirectUri: fixture.redirectUri,
  };
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
