#!/usr/bin/env node
// Validate the OIDC RP fixture against the static client policy that
// lives at `connect/src/lib/auth/oauth-client-policy.ts`.
//
// Why mirror the policy inline?
//   The spike runs without a build step and can't import a `.ts` file
//   directly. The vitest at
//   `connect/src/lib/auth/oidc-rp-fixture.test.ts` is the authoritative
//   compatibility check -- it imports the real `oauth-client-policy`
//   module and asserts the fixture against it. This script is the
//   reviewer-facing "do the obvious match" check that doesn't require
//   `pnpm install`.
//
// If `oauth-client-policy.ts` changes, both this mirror and the vitest
// must update; the vitest is the gate that fails CI.
//
// Usage: node validate-fixture.mjs
// Exit 0 on success ("RP FIXTURE VALID"), 1 on failure.

import {
  buildAuthJsProvider,
  buildConsentPolicyInput,
  buildOpenIdClientInputs,
  buildRpFixture,
} from "./auth-config.mjs";

// Mirror of `DEV_MEMORY_APP_CLIENT` in
// connect/src/lib/auth/oauth-client-policy.ts.
const STATIC_POLICY = {
  clientId: "memory-app-dev",
  redirectUris: [
    "http://localhost:3000/api/auth/callback/vana",
    "http://localhost:3001/api/auth/callback/vana",
    "http://localhost:3084/dev/login-with-vana",
    "http://localhost:3084/dev/login-with-vana/callback",
  ],
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3084",
  ],
  allowedScopes: ["openid", "profile", "email", "offline_access"],
  allowedAudiences: ["memory-app-dev"],
};

function fail(message) {
  console.error(`RP FIXTURE INVALID: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`  ok: ${message}`);
}

const fixture = buildRpFixture();
console.log("Fixture:");
console.log(`  client_id     = ${fixture.clientId}`);
console.log(`  issuer        = ${fixture.issuer}`);
console.log(`  redirect_uri  = ${fixture.redirectUri}`);
console.log(`  scopes        = ${fixture.scopes.join(" ")}`);
console.log(`  audience      = ${fixture.audience.join(" ") || "(none)"}`);
console.log(`  client_type   = ${fixture.clientType}`);
console.log(`  auth_method   = ${fixture.tokenEndpointAuthMethod}`);
console.log("");

console.log("Checking against static client policy...");

if (fixture.clientId !== STATIC_POLICY.clientId) {
  fail(
    `client_id ${fixture.clientId} does not match policy ${STATIC_POLICY.clientId}`,
  );
}
ok(`client_id matches policy (${fixture.clientId})`);

if (!STATIC_POLICY.redirectUris.includes(fixture.redirectUri)) {
  fail(
    `redirect_uri ${fixture.redirectUri} is not in policy redirect_uris [${STATIC_POLICY.redirectUris.join(", ")}]`,
  );
}
ok(`redirect_uri is in policy allowlist`);

const disallowedScope = fixture.scopes.find(
  (s) => !STATIC_POLICY.allowedScopes.includes(s),
);
if (disallowedScope) {
  fail(`scope "${disallowedScope}" is not in policy allowed_scopes`);
}
ok(`all scopes are in policy allowed_scopes`);

const disallowedAudience = fixture.audience.find(
  (a) => !STATIC_POLICY.allowedAudiences.includes(a),
);
if (disallowedAudience) {
  fail(`audience "${disallowedAudience}" is not in policy allowed_audiences`);
}
ok(`audience is in policy allowed_audiences`);

if (fixture.tokenEndpointAuthMethod !== "none") {
  fail(
    `public PKCE clients must use token_endpoint_auth_method=none; got ${fixture.tokenEndpointAuthMethod}`,
  );
}
ok(`public PKCE client (no client_secret)`);

if (fixture.codeChallengeMethod !== "S256") {
  fail(
    `code_challenge_method must be S256; got ${fixture.codeChallengeMethod}`,
  );
}
ok(`code_challenge_method=S256`);

console.log("");
console.log("Checking projection shapes...");

const authJs = buildAuthJsProvider(fixture);
for (const required of [
  "id",
  "name",
  "type",
  "issuer",
  "clientId",
  "authorization",
  "checks",
]) {
  if (!(required in authJs)) {
    fail(`Auth.js provider missing key "${required}"`);
  }
}
if (authJs.type !== "oidc") {
  fail(`Auth.js provider type must be "oidc"; got "${authJs.type}"`);
}
if (
  !authJs.checks.includes("pkce") ||
  !authJs.checks.includes("state") ||
  !authJs.checks.includes("nonce")
) {
  fail(
    `Auth.js provider checks must include pkce, state, nonce; got ${JSON.stringify(authJs.checks)}`,
  );
}
ok(
  `Auth.js provider shape: id=${authJs.id} type=${authJs.type} checks=${authJs.checks.join(",")}`,
);

const oidcClient = buildOpenIdClientInputs(fixture);
if (!oidcClient.discoveryUrl.endsWith("/.well-known/openid-configuration")) {
  fail(
    `openid-client discoveryUrl must end with /.well-known/openid-configuration`,
  );
}
if (!oidcClient.clientMetadata.redirect_uris.includes(fixture.redirectUri)) {
  fail(
    `openid-client clientMetadata.redirect_uris missing fixture redirect_uri`,
  );
}
if (
  !oidcClient.clientMetadata.grant_types.includes("authorization_code") ||
  !oidcClient.clientMetadata.grant_types.includes("refresh_token")
) {
  fail(
    `openid-client clientMetadata.grant_types must include authorization_code and refresh_token`,
  );
}
ok(`openid-client inputs: discovery=${oidcClient.discoveryUrl}`);

const policyInput = buildConsentPolicyInput(fixture);
if (policyInput.clientId !== fixture.clientId) {
  fail(`consent policy input client_id mismatch`);
}
ok(`consent policy input matches fixture`);

console.log("");
console.log("RP FIXTURE VALID");
