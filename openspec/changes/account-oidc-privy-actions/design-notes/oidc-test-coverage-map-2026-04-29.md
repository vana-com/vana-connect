# OIDC Test Coverage Map

This note maps OpenSpec task 3.7 to concrete tests and fixtures in this PR.
It separates code-level and local-POC coverage from the still-pending deployed
`https://account.vana.org` proof.

## Covered In This PR

### Issuer / Discovery

- `spikes/hydra-v26-poc/scripts/smoke.mjs` fetches
  `/.well-known/openid-configuration` and asserts discovery succeeds against
  the local Hydra v26 POC.
- `spikes/oidc-rp-fixture/standard-rp-smoke.mjs` uses `openid-client` discovery
  against the local Hydra issuer.
- `connect/src/lib/auth/hydra-public-rewrites.test.ts` asserts the
  account-domain discovery path rewrites to the configured Hydra public URL
  when `HYDRA_PUBLIC_URL` is set.

### JWKS

- `spikes/hydra-v26-poc/scripts/smoke.mjs` fetches the discovered JWKS URI and
  asserts keys are returned.
- `connect/src/lib/auth/hydra-public-rewrites.test.ts` asserts the
  account-domain JWKS path rewrites to Hydra public JWKS.

### Client Registration / Client Policy

- `spikes/hydra-v26-poc/scripts/register-client.sh` registers
  `memory-app-dev` as a public PKCE client in the local Hydra POC.
- `connect/src/lib/auth/oauth-client-policy.test.ts` covers static client
  policy for scopes/audience and redirect/origin checks.
- `connect/src/lib/auth/oidc-rp-fixture.test.ts` asserts the RP fixture matches
  the static `memory-app-dev` client policy.

### Redirect URI

- `connect/src/lib/auth/oauth-client-policy.test.ts` covers exact-match
  redirect URI allow/deny behavior, malformed values, protocol-relative inputs,
  CRLF, and non-loopback HTTP rejection.
- `connect/src/lib/auth/oidc-rp-fixture.test.ts` asserts the fixture callback
  URL is registered for `memory-app-dev`.

### State

- `spikes/hydra-v26-poc/scripts/smoke.mjs` sends a generated `state` value and
  asserts the callback returns the same value.
- `spikes/oidc-rp-fixture/standard-rp-smoke.mjs` lets `openid-client` generate
  and validate state during Authorization Code Grant processing.

### Nonce

- `spikes/hydra-v26-poc/scripts/smoke.mjs` sends a generated `nonce` value in
  the authorization request.
- `spikes/oidc-rp-fixture/standard-rp-smoke.mjs` uses `openid-client` nonce
  generation and validation during ID-token claim processing.

### PKCE

- `spikes/hydra-v26-poc/scripts/smoke.mjs` performs a public Authorization Code
  - PKCE flow with S256.
- The same smoke includes a negative public-client request without
  `code_challenge` and asserts Hydra returns `error=invalid_request` mentioning
  `code_challenge`.
- `spikes/oidc-rp-fixture/standard-rp-smoke.mjs` uses `openid-client` PKCE
  verifier/challenge helpers and validates the full code grant.

## Not Covered Yet

- No deployed `https://account.vana.org` issuer has been tested.
- No deployed Memory App/Auth.js app has completed Login with Vana against the
  account domain.
- ID-token JWS signature verification is performed by `openid-client` in the RP
  smoke, but the lower-level Hydra POC smoke only decodes claims and does not
  itself verify the JWS against JWKS.
- Production client registration, key rotation, admin isolation, revoke
  behavior, and environment configuration still need deployment proof.

## Interpretation

Task 3.7 is complete for repository-level coverage: the code, fixture, and local
Hydra POC now exercise the issuer/client/redirect/state/nonce/PKCE concerns
that can be proven without deployment. Task 8.2 remains open because deployed
Login with Vana from a real headed Memory App to `account.vana.org` is still
unproven.
