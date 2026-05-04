#!/usr/bin/env node
// Hydra v26 POC smoke test.
//
// Drives a full Authorization Code + PKCE flow against the local stack:
//
//   1. GET /.well-known/openid-configuration   (discovery)
//   2. GET /.well-known/jwks.json              (jwks)
//   3. Negative PKCE enforcement check: start /oauth2/auth WITHOUT
//      code_challenge for the public client and assert Hydra returns
//      or redirects with error=invalid_request mentioning code_challenge.
//   4. Build /oauth2/auth URL with code_challenge (S256)
//   5. Follow redirects: hydra -> login-consent -> hydra -> login-consent -> hydra -> callback
//   6. POST /oauth2/token with code + code_verifier
//   7. Decode ID token and assert sub === vana_user_dev_123
//   8. POST /userinfo with the access token; assert sub matches
//   9. POST /admin/oauth2/introspect; assert active=true, sub matches,
//      scope contains openid AND offline_access
//  10. POST /oauth2/token with refresh_token to confirm refresh works
//
// All HTTP is done with redirect: "manual" so we can capture intermediate
// hops (Hydra emits the auth code on a redirect to the registered URI,
// which is not actually served -- that's fine, we just parse Location).
//
// Exit code 0 on success, 1 on failure. Logs each step. SMOKE PASS is
// printed only if every step (including the negative check) succeeds.

import crypto from "node:crypto";

const PUBLIC = process.env.HYDRA_PUBLIC_URL ?? "http://127.0.0.1:4444";
const ADMIN = process.env.HYDRA_ADMIN_URL ?? "http://127.0.0.1:4445";
const CLIENT_ID = process.env.CLIENT_ID ?? "vana-poc-public-client";
const REDIRECT_URI = process.env.REDIRECT_URI ?? "http://127.0.0.1:8765/callback";
const EXPECTED_SUB = process.env.EXPECTED_SUB ?? "vana_user_dev_123";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makePkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function decodeJwtPayload(jwt) {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

async function follow(url, { maxHops = 10, cookieJar } = {}) {
  // Manual redirect follower. Carries cookies inside Hydra's session.
  let current = url;
  const hops = [];
  for (let i = 0; i < maxHops; i++) {
    const headers = {};
    if (cookieJar.size) {
      headers.cookie = [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(current, { redirect: "manual", headers });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const loc = res.headers.get("location");
    hops.push({ status: res.status, url: current, location: loc });
    if (res.status >= 300 && res.status < 400 && loc) {
      // Stop when we hit the registered redirect_uri -- we won't follow it.
      const next = new URL(loc, current).toString();
      if (next.startsWith(REDIRECT_URI)) {
        return { finalLocation: next, hops };
      }
      current = next;
      continue;
    }
    return { finalLocation: current, lastStatus: res.status, hops };
  }
  throw new Error(`too many redirects starting at ${url}`);
}

function step(label) {
  console.log(`\n=== ${label} ===`);
}

async function main() {
  step("1. Discovery");
  const discoveryRes = await fetch(`${PUBLIC}/.well-known/openid-configuration`);
  if (!discoveryRes.ok) throw new Error(`discovery failed: ${discoveryRes.status}`);
  const discovery = await discoveryRes.json();
  console.log(`issuer=${discovery.issuer}`);
  console.log(`authorization_endpoint=${discovery.authorization_endpoint}`);
  console.log(`token_endpoint=${discovery.token_endpoint}`);

  step("2. JWKS");
  const jwksRes = await fetch(discovery.jwks_uri);
  if (!jwksRes.ok) throw new Error(`jwks failed: ${jwksRes.status}`);
  const jwks = await jwksRes.json();
  console.log(`jwks keys=${jwks.keys.length} kids=${jwks.keys.map((k) => k.kid).join(",")}`);

  step("3. Negative PKCE enforcement");
  // Build an /oauth2/auth request with no code_challenge for the
  // public client. Hydra (with oauth2.pkce.enforced_for_public_clients
  // = true) must end the flow with error=invalid_request and an
  // error_description mentioning code_challenge.
  //
  // Empirically on Hydra v26.2.0, the rejection is not at the auth
  // endpoint entry: Hydra runs the request through login + consent
  // first (the auto-login + auto-grant stub accepts both), and only
  // after consent does Hydra emit the redirect to the callback URI
  // with error=invalid_request. We follow redirects the same way the
  // happy path does and read the final callback URL.
  const negState = b64url(crypto.randomBytes(16));
  const negUrl = new URL(discovery.authorization_endpoint);
  negUrl.searchParams.set("client_id", CLIENT_ID);
  negUrl.searchParams.set("response_type", "code");
  negUrl.searchParams.set("scope", "openid");
  negUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  negUrl.searchParams.set("state", negState);
  // intentionally no code_challenge

  const negCookieJar = new Map();
  let negFinal;
  try {
    const out = await follow(negUrl.toString(), { cookieJar: negCookieJar });
    negFinal = new URL(out.finalLocation);
  } catch (err) {
    throw new Error(`negative PKCE check: redirect follow failed: ${err.message}`);
  }
  const negError = negFinal.searchParams.get("error");
  const negDescription = negFinal.searchParams.get("error_description") ?? "";
  console.log(`negative final=${negFinal.origin}${negFinal.pathname} error=${negError}`);
  if (negFinal.searchParams.get("code")) {
    throw new Error("negative PKCE check: Hydra issued an auth code despite missing code_challenge");
  }
  if (negError !== "invalid_request") {
    throw new Error(`negative PKCE check: expected error=invalid_request, got error=${negError} desc=${negDescription}`);
  }
  if (!/code[_\s-]?challenge/i.test(negDescription)) {
    throw new Error(`negative PKCE check: error_description did not mention code_challenge: ${negDescription}`);
  }
  console.log(`negative PKCE rejected as expected: error=${negError} (description mentions code_challenge)`);

  step("4. Authorization Code + PKCE -- start");
  const { verifier, challenge } = makePkce();
  const state = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));
  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid offline_access");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  console.log(`auth url=${authUrl}`);

  const cookieJar = new Map();
  const { finalLocation, hops } = await follow(authUrl.toString(), { cookieJar });
  for (const h of hops) console.log(`  hop status=${h.status} -> ${h.location ?? "(no redirect)"}`);
  console.log(`final=${finalLocation}`);

  const callbackUrl = new URL(finalLocation);
  if (callbackUrl.searchParams.get("error")) {
    throw new Error(
      `auth flow ended with error: ${callbackUrl.searchParams.get("error")} ${callbackUrl.searchParams.get("error_description") ?? ""}`,
    );
  }
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  if (!code) throw new Error("no auth code on callback");
  if (returnedState !== state) throw new Error(`state mismatch: ${returnedState} != ${state}`);
  console.log(`got code=${code.slice(0, 12)}...`);

  step("5. Token exchange");
  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();
  console.log(`access_token=${tokens.access_token.slice(0, 20)}... token_type=${tokens.token_type}`);
  console.log(`id_token present=${Boolean(tokens.id_token)} refresh_token present=${Boolean(tokens.refresh_token)}`);

  step("6. ID token sub assertion");
  if (!tokens.id_token) throw new Error("no id_token");
  const idClaims = decodeJwtPayload(tokens.id_token);
  console.log(`id_token claims sub=${idClaims.sub} aud=${JSON.stringify(idClaims.aud)} iss=${idClaims.iss}`);
  console.log(`id_token vana_user_id=${idClaims.vana_user_id}`);
  if (idClaims.sub !== EXPECTED_SUB) {
    throw new Error(`id_token.sub mismatch: ${idClaims.sub} != ${EXPECTED_SUB}`);
  }
  if (idClaims.vana_user_id !== EXPECTED_SUB) {
    throw new Error(`id_token.vana_user_id mismatch: ${idClaims.vana_user_id} != ${EXPECTED_SUB}`);
  }

  step("7. UserInfo");
  const userinfoRes = await fetch(`${PUBLIC}/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) {
    throw new Error(`userinfo failed: ${userinfoRes.status} ${await userinfoRes.text()}`);
  }
  const userinfo = await userinfoRes.json();
  console.log(`userinfo sub=${userinfo.sub}`);
  if (userinfo.sub !== EXPECTED_SUB) {
    throw new Error(`userinfo.sub mismatch: ${userinfo.sub} != ${EXPECTED_SUB}`);
  }

  step("8. Introspection (admin)");
  const introspectRes = await fetch(`${ADMIN}/admin/oauth2/introspect`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tokens.access_token }),
  });
  if (!introspectRes.ok) throw new Error(`introspect failed: ${introspectRes.status}`);
  const introspect = await introspectRes.json();
  console.log(`introspect active=${introspect.active} sub=${introspect.sub} scope=${introspect.scope}`);
  if (!introspect.active) throw new Error("introspect reports inactive token");
  if (introspect.sub !== EXPECTED_SUB) {
    throw new Error(`introspect.sub mismatch: ${introspect.sub} != ${EXPECTED_SUB}`);
  }
  const introspectScopes = (introspect.scope ?? "").split(/\s+/).filter(Boolean);
  for (const required of ["openid", "offline_access"]) {
    if (!introspectScopes.includes(required)) {
      throw new Error(`introspect.scope missing '${required}': got '${introspect.scope}'`);
    }
  }

  step("9. Refresh token");
  if (tokens.refresh_token) {
    const refreshRes = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: CLIENT_ID,
      }),
    });
    if (!refreshRes.ok) {
      const body = await refreshRes.text();
      throw new Error(`refresh failed: ${refreshRes.status} ${body}`);
    }
    const refreshed = await refreshRes.json();
    console.log(`refreshed access_token=${refreshed.access_token.slice(0, 20)}...`);
    if (refreshed.id_token) {
      const refreshedClaims = decodeJwtPayload(refreshed.id_token);
      if (refreshedClaims.sub !== EXPECTED_SUB) {
        throw new Error(`refreshed id_token.sub mismatch: ${refreshedClaims.sub}`);
      }
      console.log(`refreshed id_token sub=${refreshedClaims.sub}`);
    }
  } else {
    console.log("no refresh_token returned -- skipped (offline_access scope required)");
  }

  console.log("\nSMOKE PASS");
}

main().catch((err) => {
  console.error("\nSMOKE FAIL:", err.message);
  if (err.body) console.error(err.body);
  process.exit(1);
});
