# OIDC Relying-Party Fixture

A small, dependency-free fixture that describes how a standard OIDC
relying party (Auth.js / NextAuth, `openid-client`, or any RFC 6749 +
OIDC Core RP) should be configured to log in with Vana via the
`memory-app-dev` OAuth client.

This fixture is review-only evidence for OpenSpec change
`account-oidc-privy-actions`, task 3.8 (NextAuth/Auth.js compatibility
test or fixture). It does NOT run a clean-user end-to-end browser
flow, so it does not by itself satisfy task 10.5.

## What this fixture is

- A pure JavaScript module (`auth-config.mjs`) that returns the
  Auth.js v5 custom-OIDC-provider config object, the expected Auth.js
  callback URL, and the equivalent `openid-client` discovery inputs for
  `memory-app-dev`.
- A validator script (`validate-fixture.mjs`) that asserts the
  fixture matches the static client policy at
  `connect/src/lib/auth/oauth-client-policy.ts`. Run it with
  `node validate-fixture.mjs` -- no install needed.
- A vitest companion at
  `connect/src/lib/auth/oidc-rp-fixture.test.ts` that imports the
  same fixture module and asserts shape compatibility against the
  in-tree `OauthClientRegistry` and `evaluateConsentPolicy`. This is
  the test the OpenSpec task 3.8 refers to.
- A clean-user smoke plan (below) that records the exact commands a
  reviewer would run to drive the fixture against the local Hydra
  v26 POC, and the precise blocker(s) that prevent running it
  against the deployed `account.vana.org` today.

## What this fixture is NOT

- It is NOT an installed Auth.js / NextAuth Next app. The
  account app intentionally does not yet expose
  `/.well-known/openid-configuration`, `/oauth2/token`, or
  `/oauth2/userinfo` as production routes -- those endpoints are
  owned by Hydra in the target architecture (see
  `openspec/changes/account-oidc-privy-actions/design.md` D1).
  Running an actual Auth.js RP against `https://account.vana.org`
  today would fail at discovery, so we do not check in dead code
  pretending otherwise.
- It is NOT a substitute for the Hydra v26 POC smoke
  (`spikes/hydra-v26-poc/scripts/smoke.mjs`), which already proves
  Authorization Code + PKCE, ID-token `sub = vana_user_id`,
  userinfo, introspection, and refresh against a Vana-owned
  login/consent app. The RP fixture reuses Hydra POC settings as
  the issuer so reviewers can correlate the two artifacts without
  spinning up a second IdP.

## Files

```
spikes/oidc-rp-fixture/
+-- README.md              # this document
+-- auth-config.mjs        # pure config module (no runtime deps)
\-- validate-fixture.mjs   # node-only validator (no install)
```

The companion vitest lives in
`connect/src/lib/auth/oidc-rp-fixture.test.ts` so it runs as part of
`pnpm --dir connect test`.

## Compatibility shape

The fixture exports two views of the same RP configuration:

1. **Auth.js v5 custom OIDC provider** (`buildAuthJsProvider`).
   Matches the shape that `Auth.js({ providers: [...] })` accepts
   for a custom OIDC provider with PKCE. The callback URL is not a
   provider config field; Auth.js derives it from the app origin and
   provider id. The fixture records the expected callback URL as
   `fixture.redirectUri` so it can be checked against Vana's static
   client policy.
2. **openid-client discovery inputs** (`buildOpenIdClientInputs`).
   Matches what `openid-client.discover()` plus `Client` would need
   given a chosen issuer URL. This is the lower-level shape that
   server-side RPs (including custom Next.js handlers) tend to use.

Both share a single `RpFixture` source of truth so they cannot
drift.

## Default issuer

The fixture defaults to the local Hydra v26 POC issuer
(`http://127.0.0.1:4444`) because that is the only Vana OIDC
provider that currently exposes a real discovery document end-to-end
on a developer laptop. The issuer URL, client id, and redirect URI
can be overridden by env (`VANA_OIDC_ISSUER`, `VANA_OIDC_CLIENT_ID`,
`VANA_OIDC_REDIRECT_URI`) so reviewers can re-point the same fixture
at Ory Network, a managed issuer POC, or a future
`https://account.vana.org` issuer once it ships.

## Clean-user smoke plan

The fixture is meant to be runnable by a reviewer with no prior
state. The exact sequence is:

```bash
# 1. From a clean checkout of this branch:
cd spikes/hydra-v26-poc
./scripts/up.sh                    # boots Hydra v26 + Postgres + login-consent stub
./scripts/register-client.sh       # registers vana-poc-public-client

# 2. Register the memory-app-dev client (so the RP fixture client_id
#    matches the static policy at oauth-client-policy.ts):
CLIENT_ID=memory-app-dev \
REDIRECT_URI=http://localhost:3000/api/auth/callback/vana \
./scripts/register-client.sh

# 3. Validate the fixture against the static client policy:
cd ../oidc-rp-fixture
node validate-fixture.mjs

# 4. Drive the fixture's discovery + auth + token flow against Hydra
#    using the POC smoke (the RP fixture currently delegates to the
#    Hydra POC smoke for transport-level proof; see Limitations
#    below):
cd ../hydra-v26-poc
CLIENT_ID=memory-app-dev \
REDIRECT_URI=http://localhost:3000/api/auth/callback/vana \
EXPECTED_SUB=vana_user_dev_123 \
node ./scripts/smoke.mjs
```

Expected outputs:

- `validate-fixture.mjs` prints `RP FIXTURE VALID` and exits 0.
- `smoke.mjs` prints `SMOKE PASS` with `id_token sub=vana_user_dev_123`
  and `aud=["memory-app-dev"]` (override taken from `CLIENT_ID`).

## Why 10.5 is not yet satisfied

Task 10.5 calls for "the standard OIDC relying-party fixture from a
clean user and exact command/output in the PR". This fixture
provides the commands, but a clean-user run has not yet been
recorded against:

- a deployed `account.vana.org` issuer -- because the production
  OIDC discovery/token/userinfo endpoints are not yet wired (see
  task 3.x); or
- a local Hydra POC + Auth.js Next app -- because the dev Memory
  App relying party (task 8.1) has not been built yet, so there is
  no headed RP to log in from.

Marking 10.5 complete would overclaim. The fixture's clean-user
smoke plan is precise enough that the next worker (or a reviewer)
can run it as soon as either of those gaps closes.

## Limitations / known gaps

- The fixture's discovery target is the Hydra POC, not the Next
  account app. Once `account.vana.org` exposes either a managed
  issuer or a Hydra-fronted public OIDC surface, switch
  `VANA_OIDC_ISSUER` and re-run.
- The fixture does not include a real Auth.js Next app. The
  Auth.js provider object is validated for shape only. Building
  a runnable Auth.js RP belongs to task 8.1; once that exists, the
  RP can import this fixture's `buildAuthJsProvider()` directly so
  the two cannot drift.
- The validator does not verify ID-token signatures. Signature
  verification is already deferred in the Hydra POC smoke
  (`spikes/hydra-v26-poc/README.md` "What this does NOT prove").
  Adding a JWT library to either spike is the same future task.
- The fixture asserts `redirect_uri` against the static policy in
  `oauth-client-policy.ts`. If a future migration moves clients to
  DB-backed storage, the validator must be re-pointed at the new
  registry; the test in
  `connect/src/lib/auth/oidc-rp-fixture.test.ts` is already
  decoupled via the public registry API.

## Cleanup

This fixture creates no persistent state. The Hydra POC owns its
own Docker volumes and is cleaned up by
`spikes/hydra-v26-poc/scripts/down.sh`.
