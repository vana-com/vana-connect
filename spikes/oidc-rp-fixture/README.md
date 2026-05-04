# OIDC Relying-Party Fixture

A small fixture that describes how a standard OIDC relying party
(Auth.js / NextAuth, `openid-client`, or any RFC 6749 + OIDC Core RP)
should be configured to log in with Vana via the `memory-app-dev`
OAuth client.

This fixture is review-only evidence for OpenSpec change
`account-oidc-privy-actions`, task 3.8 (NextAuth/Auth.js compatibility
test or fixture) and task 10.5 (standard RP smoke from clean local
state). It proves the local Hydra POC with a standard RP library; it
does not prove deployed production OIDC for `account.vana.org`.

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
- A clean-user smoke (below) that records the exact commands and
  output from driving the fixture through a standard `openid-client`
  relying party against the local Hydra v26 POC.
- A mock account-hosted action fixture (`action-config.mjs`) that
  defines the request and exchange bodies for the first Memory App
  action-code proof. The companion vitest at
  `connect/src/lib/auth/memory-app-action-flow.test.ts` drives the
  real account-action handlers with in-memory persistence.

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
+-- action-config.mjs      # Memory App mock action request/exchange fixture
+-- validate-fixture.mjs   # node-only validator (no install)
\-- standard-rp-smoke.mjs  # openid-client end-to-end RP smoke
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

## Mock action-code shape

`action-config.mjs` exports the first Memory App action request body:

- `client_id = "memory-app-dev"`
- `redirect_uri = "http://localhost:3000/api/auth/callback/vana"`
- `action_type = "memory.read.mock"`
- `execution_mode = "mock"`
- `result_mode = "mock"`
- `requested_data.connector = "memory"`
- `requested_data.scopes = ["memory.read"]`
- `requested_data.accessMode = "read_once"`
- user-facing display metadata for the account-hosted review page
- browser-carried `state`

The authoritative proof is
`connect/src/lib/auth/memory-app-action-flow.test.ts`. It creates a
mock action request, approves it as a logged-in Vana user, extracts
the redirect `action_code`, exchanges that code as `memory-app-dev`,
and asserts:

- the exchanged payload is `result_mode: "mock"`
- the exchanged payload does not include the raw action code, state,
  or `vana_user_id`
- the consent/action event sequence is `action.requested`,
  `action.approved`, `action.exchanged`

This is still an in-process fixture proof. It does not prove a headed
Memory App or deployed `account.vana.org` action flow.

## Default issuer

The fixture defaults to the local Hydra v26 POC issuer
(`http://127.0.0.1:4444`) because that is the only Vana OIDC
provider that currently exposes a real discovery document end-to-end
on a developer laptop. The issuer URL, client id, and redirect URI
can be overridden by env (`VANA_OIDC_ISSUER`, `VANA_OIDC_CLIENT_ID`,
`VANA_OIDC_REDIRECT_URI`) so reviewers can re-point the same fixture
at Ory Network, a managed issuer POC, or a future
`https://account.vana.org` issuer once it ships.

## Clean-user smoke

The fixture is meant to be runnable by a reviewer with no prior
state. The exact sequence run on 2026-04-29 was:

```bash
# 1. From a clean checkout of this branch:
cd spikes/hydra-v26-poc
./scripts/up.sh                    # boots Hydra v26 + Postgres + login-consent stub

# 2. Register the memory-app-dev client (so the RP fixture client_id
#    matches the static policy at oauth-client-policy.ts):
CLIENT_ID=memory-app-dev \
CLIENT_NAME="Memory App (dev)" \
REDIRECT_URI=http://localhost:3000/api/auth/callback/vana \
SCOPE="openid profile email" \
AUDIENCE="memory-app-dev" \
./scripts/register-client.sh

# 3. Validate the fixture against the static client policy:
cd ../oidc-rp-fixture
node validate-fixture.mjs

# 4. Drive the fixture with a standard OIDC RP library:
node standard-rp-smoke.mjs
```

The standard RP smoke uses `openid-client@6.8.4` from the root
lockfile. It performs discovery, builds an Authorization Code + PKCE
request with state and nonce, follows the local Hydra login/consent
stub, performs `authorizationCodeGrant`, verifies ID-token claims, and
fetches UserInfo.

Exact output from `node standard-rp-smoke.mjs`:

```text
=== 1. Fixture ===
issuer=http://127.0.0.1:4444
client_id=memory-app-dev
redirect_uri=http://localhost:3000/api/auth/callback/vana
scope=openid profile email
audience=memory-app-dev

=== 2. Discovery via openid-client ===
discovered issuer=http://127.0.0.1:4444
authorization_endpoint=http://127.0.0.1:4444/oauth2/auth
token_endpoint=http://127.0.0.1:4444/oauth2/token
userinfo_endpoint=http://127.0.0.1:4444/userinfo

=== 3. Authorization URL with PKCE/state/nonce ===
authorization_url=http://127.0.0.1:4444/oauth2/auth?redirect_uri,scope,audience,code_challenge,code_challenge_method,state,nonce,client_id,response_type

=== 4. Follow Hydra login/consent redirects ===
  hop status=302 -> http://127.0.0.1:3000/login?login_challenge
  hop status=302 -> http://127.0.0.1:4444/oauth2/auth?audience,client_id,code_challenge,code_challenge_method,login_verifier,nonce,redirect_uri,response_type,scope,state
  hop status=302 -> http://127.0.0.1:3000/consent?consent_challenge
  hop status=302 -> http://127.0.0.1:4444/oauth2/auth?audience,client_id,code_challenge,code_challenge_method,consent_verifier,nonce,redirect_uri,response_type,scope,state
  hop status=303 -> http://localhost:3000/api/auth/callback/vana?code,scope,state
callback=http://localhost:3000/api/auth/callback/vana?code,scope,state

=== 5. Authorization Code Grant via openid-client ===
access_token present=true
id_token present=true
token_type=bearer

=== 6. ID-token claims ===
id_token sub=vana_user_dev_123
id_token aud=["memory-app-dev"]
id_token iss=http://127.0.0.1:4444
id_token vana_user_id=vana_user_dev_123

=== 7. UserInfo via openid-client ===
userinfo sub=vana_user_dev_123

STANDARD RP SMOKE PASS
```

## Why production OIDC is still not proven

This satisfies OpenSpec task 10.5 against the local Hydra POC. It does
not prove a deployed `https://account.vana.org` issuer yet, because
the production discovery/token/userinfo surface is still part of task
3.x.

## Limitations / known gaps

- The fixture's discovery target is the Hydra POC, not the Next
  account app. Once `account.vana.org` exposes either a managed
  issuer or a Hydra-fronted public OIDC surface, switch
  `VANA_OIDC_ISSUER` and re-run.
- The fixture does not include a real Auth.js Next app. The Auth.js
  provider object is validated for shape only; the standard RP smoke
  uses `openid-client` instead.
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
