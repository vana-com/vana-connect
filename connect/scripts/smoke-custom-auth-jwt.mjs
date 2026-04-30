#!/usr/bin/env node
// Smoke test the account-domain pieces needed before Privy custom
// authentication can be switched on. This intentionally does not require a
// Privy Scale-plan feature unlock.

const baseUrl = (
  process.argv.slice(2).find((arg) => arg !== "--") ||
  process.env.ACCOUNT_BASE_URL ||
  "https://account-dev.vana.org"
).replace(/\/+$/u, "");

async function fetchJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const jwks = await fetchJson("/.well-known/jwks.json");
  assert(jwks.response.status === 200, `JWKS status ${jwks.response.status}`);
  assert(Array.isArray(jwks.body.keys), "JWKS keys missing");
  assert(jwks.body.keys.length >= 1, "JWKS has no keys");
  const key = jwks.body.keys[0];
  assert(key.kty === "RSA", "JWKS key must be RSA");
  assert(key.alg === "RS256", "JWKS key must be RS256");
  assert(key.use === "sig", "JWKS key must be use=sig");
  assert(typeof key.kid === "string" && key.kid, "JWKS kid missing");
  assert(!("d" in key), "JWKS must not expose private exponent");

  const diagnostics = await fetchJson(
    "/api/auth/privy-custom-auth-jwt/diagnostics",
  );
  assert(
    diagnostics.response.status === 200,
    `diagnostics status ${diagnostics.response.status}`,
  );
  assert(diagnostics.body.signer?.ready === true, "signer is not ready");
  assert(
    diagnostics.body.privyCustomAuth?.jwtIdClaim === "sub",
    "diagnostics JWT ID claim mismatch",
  );

  const unauth = await fetchJson("/api/auth/privy-custom-auth-jwt");
  assert(
    unauth.response.status === 401,
    `JWT unauth status ${unauth.response.status}`,
  );
  assert(
    unauth.response.headers.get("cache-control") === "no-store",
    "JWT unauth response must be no-store",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        jwksKid: key.kid,
        jwtSyncEnabled: diagnostics.body.appConfig?.jwtSyncEnabled ?? null,
        privyPlanGate: diagnostics.body.privyCustomAuth?.requiredPlan ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
