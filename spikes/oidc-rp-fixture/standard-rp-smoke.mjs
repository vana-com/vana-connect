#!/usr/bin/env node
// Standard OIDC relying-party smoke for the Memory App fixture.
//
// This intentionally uses `openid-client` rather than hand-written token
// exchange code. The Hydra POC smoke proves raw issuer transport; this script
// proves a normal RP library can discover the issuer, build an authorization
// request with PKCE/state/nonce, process the callback, validate ID-token
// state/nonce/signature semantics, and fetch UserInfo.

import {
  None,
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  fetchUserInfo,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { buildOpenIdClientInputs, buildRpFixture } from "./auth-config.mjs";

const EXPECTED_SUB = process.env.EXPECTED_SUB ?? "vana_user_dev_123";
const VERBOSE = process.env.RP_SMOKE_VERBOSE === "1";

function step(label) {
  console.log(`\n=== ${label} ===`);
}

async function followRedirects(url, { redirectUri, maxHops = 10 } = {}) {
  let current = url.toString();
  const cookies = new Map();
  const hops = [];

  for (let i = 0; i < maxHops; i += 1) {
    const headers = {};
    if (cookies.size > 0) {
      headers.cookie = [...cookies.entries()]
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    }

    const response = await fetch(current, { redirect: "manual", headers });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0)
        cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    const location = response.headers.get("location");
    hops.push({ status: response.status, url: current, location });

    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current).toString();
      if (next.startsWith(redirectUri)) return { finalLocation: next, hops };
      current = next;
      continue;
    }

    return { finalLocation: current, lastStatus: response.status, hops };
  }

  throw new Error(`too many redirects starting at ${url}`);
}

function summarizeUrl(value) {
  if (!value) return "(no redirect)";
  if (VERBOSE) return value;
  const url = new URL(value);
  const keys = [...url.searchParams.keys()];
  return `${url.origin}${url.pathname}${keys.length > 0 ? `?${keys.join(",")}` : ""}`;
}

async function main() {
  const fixture = buildRpFixture();
  const inputs = buildOpenIdClientInputs(fixture);

  step("1. Fixture");
  console.log(`issuer=${fixture.issuer}`);
  console.log(`client_id=${fixture.clientId}`);
  console.log(`redirect_uri=${fixture.redirectUri}`);
  console.log(`scope=${fixture.scopes.join(" ")}`);
  console.log(`audience=${fixture.audience.join(" ")}`);

  step("2. Discovery via openid-client");
  const config = await discovery(
    new URL(fixture.issuer),
    fixture.clientId,
    inputs.clientMetadata,
    None(),
    { execute: [allowInsecureRequests] },
  );
  const server = config.serverMetadata();
  console.log(`discovered issuer=${server.issuer}`);
  console.log(`authorization_endpoint=${server.authorization_endpoint}`);
  console.log(`token_endpoint=${server.token_endpoint}`);
  console.log(`userinfo_endpoint=${server.userinfo_endpoint}`);

  step("3. Authorization URL with PKCE/state/nonce");
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();
  const nonce = randomNonce();
  const authorizationUrl = buildAuthorizationUrl(config, {
    redirect_uri: fixture.redirectUri,
    scope: fixture.scopes.join(" "),
    ...(fixture.audience.length > 0
      ? { audience: fixture.audience.join(" ") }
      : {}),
    code_challenge: codeChallenge,
    code_challenge_method: fixture.codeChallengeMethod,
    state,
    nonce,
  });
  console.log(`authorization_url=${summarizeUrl(authorizationUrl.toString())}`);

  step("4. Follow Hydra login/consent redirects");
  const { finalLocation, hops } = await followRedirects(authorizationUrl, {
    redirectUri: fixture.redirectUri,
  });
  for (const hop of hops) {
    console.log(`  hop status=${hop.status} -> ${summarizeUrl(hop.location)}`);
  }
  console.log(`callback=${summarizeUrl(finalLocation)}`);

  const callbackUrl = new URL(finalLocation);
  if (callbackUrl.searchParams.get("error")) {
    throw new Error(
      `authorization failed: ${callbackUrl.searchParams.get("error")} ${
        callbackUrl.searchParams.get("error_description") ?? ""
      }`,
    );
  }

  step("5. Authorization Code Grant via openid-client");
  const tokens = await authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  console.log(`access_token present=${Boolean(tokens.access_token)}`);
  console.log(`id_token present=${Boolean(tokens.id_token)}`);
  console.log(`token_type=${tokens.token_type}`);

  step("6. ID-token claims");
  const claims = tokens.claims();
  if (!claims) throw new Error("openid-client did not return ID-token claims");
  console.log(`id_token sub=${claims.sub}`);
  console.log(`id_token aud=${JSON.stringify(claims.aud)}`);
  console.log(`id_token iss=${claims.iss}`);
  console.log(`id_token vana_user_id=${claims.vana_user_id}`);
  if (claims.sub !== EXPECTED_SUB) {
    throw new Error(`id_token.sub mismatch: ${claims.sub} != ${EXPECTED_SUB}`);
  }
  if (claims.vana_user_id !== EXPECTED_SUB) {
    throw new Error(
      `id_token.vana_user_id mismatch: ${claims.vana_user_id} != ${EXPECTED_SUB}`,
    );
  }

  step("7. UserInfo via openid-client");
  const userinfo = await fetchUserInfo(
    config,
    tokens.access_token,
    EXPECTED_SUB,
  );
  console.log(`userinfo sub=${userinfo.sub}`);
  if (userinfo.sub !== EXPECTED_SUB) {
    throw new Error(
      `userinfo.sub mismatch: ${userinfo.sub} != ${EXPECTED_SUB}`,
    );
  }

  console.log("\nSTANDARD RP SMOKE PASS");
}

main().catch((error) => {
  console.error("\nSTANDARD RP SMOKE FAIL:", error.message);
  if (error.cause) console.error(error.cause);
  process.exit(1);
});
