# Hydra v26 POC: OIDC issuer with `sub = vana_user_id`

A self-contained, disposable proof scaffold for an Ory Hydra-based Vana
identity issuer. Nothing here is wired into the production app; it lives
under `spikes/` and is intended to be deleted (or graduated piece by
piece) once the production design is settled.

## Purpose

Prove, end to end, on a developer laptop:

1. We can stand up Hydra v26 + Postgres + a Vana-owned login/consent UI
   from a single `docker compose up`.
2. A public Authorization Code + PKCE client (no `client_secret`) can
   complete a full flow.
3. The issued ID token's `sub` claim is the canonical Vana user id
   (`vana_user_dev_123` in this POC), set by the consent app -- _not_
   any upstream provider id.
4. Discovery (`/.well-known/openid-configuration`), JWKS retrieval,
   userinfo, token introspection, and refresh all behave as expected
   against that subject. (The smoke script fetches the JWKS but does
   NOT verify the ID token signature against it -- see Known gaps.)
5. With `oauth2.pkce.enforced_for_public_clients: true`, an
   authorization request from the public client without
   `code_challenge` is ultimately rejected by Hydra with
   `error=invalid_request` and a description mentioning
   `code_challenge`. Empirically Hydra v26.2.0 routes the request
   through login and consent first and emits the rejection on the
   redirect to the registered callback URI; the smoke script
   follows redirects the same way the happy path does and asserts
   on the final callback URL.

This is the auth-side companion proof to the
`account-domain-identity-issuer` OpenSpec change. It does not commit
us to Hydra; it just establishes a verifiable baseline so subject
semantics and the public-PKCE contract stop being theoretical.

## Image / version

Pinned to `oryd/hydra:v26.2.0` (current Hydra line; built 2026-03-20).
v26.x renumbered from the older v2.x line; the config schema, CLI
flags (`serve all --dev --config ...`, `migrate sql -e --yes`), and
admin/public ports (`4445` / `4444`) used here are the same as v2.2.x.
If a newer v26 patch tag becomes available and the schema is unchanged,
bumping the tag in `docker-compose.yml` is the only required edit.

## Prerequisites

- Docker 24+ and Docker Compose v2 (compose v5 is what the author ran).
- Node.js 20+ on the host (smoke script uses only the stdlib `fetch`
  and `node:crypto`; no `npm install`).
- Ports `3000`, `4444`, `4445` free on `127.0.0.1`.
- No cloud credentials, no real secrets.

## Layout

```
spikes/hydra-v26-poc/
+-- docker-compose.yml         # Postgres + Hydra (migrate + serve) + login-consent
+-- config/
|   \-- hydra.yml              # bind-mounted into both hydra services; source of truth
+-- login-consent/
|   +-- Dockerfile             # node:20-alpine
|   \-- server.mjs             # ~130 LoC Vana-owned login + consent UI
\-- scripts/
    +-- up.sh                  # docker compose up -d --build + wait + register client
    +-- down.sh                # docker compose down -v
    +-- register-client.sh     # creates the public PKCE client via admin API
    \-- smoke.mjs              # full discovery -> JWKS -> auth -> token -> assert sub flow
```

## Configuration source of truth

`config/hydra.yml` is bind-mounted into both the `hydra-migrate` and
`hydra` containers at `/etc/hydra/hydra.yml`, and Hydra is started
with `--config /etc/hydra/hydra.yml`. All Hydra settings -- issuer
URL, login/consent/logout URLs, system/cookie secrets, PKCE
enforcement, token TTLs, CORS -- live in that file. Editing the YAML
and restarting (`docker compose up -d hydra hydra-migrate`) is the
right way to change Hydra config.

The only Hydra setting passed via environment variable is `DSN`,
because it is environment-specific and we don't want to commit it
to the YAML.

## Commands

```bash
# bring everything up and register the client
./scripts/up.sh

# run the full smoke test (discovery, JWKS fetch, negative PKCE check,
# auth code + PKCE, sub assertion, userinfo, introspect, refresh)
node ./scripts/smoke.mjs

# tear down + wipe volumes
./scripts/down.sh
```

If you want to drive the flow manually in a browser, register the
client and then visit the URL printed by `scripts/smoke.mjs` at step 3
-- but `127.0.0.1:8765/callback` is not actually served, so the browser
will land on a "site can't be reached" page with the auth code in the
URL. That's expected; the smoke script just parses the redirect
without ever fetching the callback URI.

## Expected outputs

Successful `node ./scripts/smoke.mjs` ends with:

```
=== 1. Discovery ===
issuer=http://127.0.0.1:4444
...
=== 5. ID token sub assertion ===
id_token claims sub=vana_user_dev_123 aud=["vana-poc-public-client"] iss=http://127.0.0.1:4444
id_token vana_user_id=vana_user_dev_123
=== 6. UserInfo ===
userinfo sub=vana_user_dev_123
=== 7. Introspection (admin) ===
introspect active=true sub=vana_user_dev_123 scope=openid offline_access
=== 8. Refresh token ===
refreshed access_token=...
refreshed id_token sub=vana_user_dev_123

SMOKE PASS
```

## What this proves

- A public Authorization Code + PKCE client with
  `token_endpoint_auth_method: "none"` works end to end against
  Hydra v26.2.0 with `oauth2.pkce.enforced_for_public_clients: true`.
- Hydra rejects an authorization request from the public client when
  `code_challenge` is absent, with `error=invalid_request` referencing
  `code_challenge`. The smoke script asserts this.
- The OIDC `sub` is whatever subject the Vana-owned consent app
  passes to `accept_login` -- meaning the issuer's contract for "the
  canonical user is `vana_user_id`" is enforceable in the consent
  layer, not by Hydra config.
- A non-standard claim (`vana_user_id`) can be added to the ID token
  via the consent `session.id_token` payload, so the wallet-rooted
  identity contract can ride alongside `sub` if the audience needs
  both.
- Refresh tokens (with `offline_access`) preserve `sub` across
  rotation.
- The admin API (`:4445`) is sufficient for client management and
  introspection from inside the docker network and from localhost
  only on the host. Production must keep this private.

## What this does NOT prove

- ID token signature validity. The smoke script base64-decodes the
  ID token payload to assert claims; it does NOT verify the JWS
  signature against the JWKS. Any signature-related guarantee is
  out of scope for this proof.
- That the login/consent app implements real authentication or real
  consent. It is an auto-login + auto-grant stub: every login
  challenge is accepted as `vana_user_dev_123` with no credentials,
  and every consent challenge is auto-accepted granting whatever
  scope the client requested. This is intentional for the POC; a
  production issuer must replace both endpoints with real flows.
- Anything about logout, revocation, audience allowlisting, or
  refresh-token rotation/revocation semantics beyond a single
  successful refresh.

## Security caveats

- `secrets.system` and `secrets.cookie` in `config/hydra.yml` are
  hardcoded dev strings. They are 32 chars to satisfy Hydra's
  minimum, but they are obviously not secrets. Never reuse them.
- `log.leak_sensitive_values: true` and
  `oauth2.expose_internal_errors: true` are set for debuggability.
  Both must be off in production.
- `--dev` is passed to `hydra serve all`, which disables HTTPS and
  some hardening defaults. Production must terminate TLS in front of
  Hydra and remove `--dev`.
- The login/consent app is an auto-login + auto-grant stub: any
  login challenge is accepted as `vana_user_dev_123` with no
  credentials, and any consent challenge is auto-granted for
  whatever scopes the client requested. That is the entire point of
  the POC and obviously not safe outside it.
- The admin port (`4445`) is bound to `127.0.0.1` only. In a real
  deployment, it must be on a private network or a separate
  ingress.
- Postgres credentials (`hydra:hydra-poc-pw`) are local-only.

## Cleanup

```bash
./scripts/down.sh
docker image rm oryd/hydra:v26.2.0 postgres:16-alpine 2>/dev/null || true
```

When the POC graduates or is abandoned, delete the
`spikes/hydra-v26-poc/` directory; nothing in the production codebase
imports from it.

## Known gaps / deferred

- No revocation flow exercised. `POST /oauth2/revoke` is supported by
  Hydra; the smoke script does not call it. If a future slice cares
  about session revocation semantics, add it there.
- Logout flow is wired in `server.mjs` but not exercised by the smoke
  script.
- The smoke script does NOT validate the ID token signature against
  the JWKS. It only fetches the JWKS to confirm the endpoint
  responds, and it base64-decodes the ID token payload (an unsigned
  read) to assert `sub`. Treat all "ID token sub == ..." results as
  reading whatever Hydra returned, not as a cryptographic guarantee.
  Signature verification requires a JWT library, which the POC
  deliberately avoids to keep the smoke script dependency-free; it
  must be added before any consumer relies on these tokens.
- No automated tests for the login-consent app itself.
- No migration of old Vana Hydra config; this is intentional.
