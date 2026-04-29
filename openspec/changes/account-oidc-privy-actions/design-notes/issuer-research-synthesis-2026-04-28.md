# Issuer Research Synthesis

Date: 2026-04-28
Change: `account-oidc-privy-actions`

## Current Decision

Do not proceed as if the OIDC issuer must be implemented inside the Vercel-linked Next.js app.

The current issuer decision gate is:

1. Evaluate repurposed Ory Hydra / Ory Network first.
2. Evaluate managed issuer options that preserve `sub = vana_user_id`, especially WorkOS Connect/AuthKit and Stytch Connected Apps.
3. Keep `oidc-provider` as a self-hosted Node fallback, preferably as a dedicated sidecar if selected.

Current recommendation: reuse the Hydra pattern, but upgrade it. Self-hosted Hydra or Ory Network is the control path. WorkOS/Stytch are POC alternatives. The `oidc-provider` route-handler spike is fallback evidence.

A local Hydra `v26.2.0` POC now exists under `spikes/hydra-v26-poc/`. It moves the Hydra question from "can this issuer model work?" to "which production deployment and operations shape should own it?"

## Evidence

### Prior Vana Ory Hydra art exists

`vana-com/vana-oauth` describes Vana OAuth services using Ory Hydra. It exposed public endpoints including discovery, JWKS, `/oauth2/auth`, `/oauth2/token`, revoke, logout, and userinfo at `https://development-oauth.vana.com`, with admin endpoints at `https://development-oauth-admin.vana.com`.

The repo used `oryd/hydra:v2.1.2`, generated `hydra.yml` from environment, persisted to Postgres, and deployed separate public/admin Google Cloud Run services. That shape avoids exposing the Hydra admin API publicly and avoids embedding an issuer into the Next app runtime.

`vana-gotchi-js-api` contains prior integration code:

- `src/config/oauth.ts`: Ory client, admin API authentication, and token introspection.
- `src/pages/api/v0/oauth/login.ts`: Hydra login challenge handling and `subject: account.id`.
- `src/pages/api/v0/oauth/consent.ts`: Hydra consent challenge handling.
- `src/utils/auth/exchangeOryAccessTokenForVanaToken.ts`: introspects Hydra access tokens and exchanges them for Vana API tokens.

`vana-gotchi-pwa` contains prior user-facing and client-side pieces:

- `apps/app/app/(auth)/login/page.tsx`: login challenge handling.
- `apps/app/app/(auth)/consent/page.tsx`: consent UI.
- `apps/cafe/app/(auth)/vana-oauth.ts`: Authorization Code + PKCE client flow.

The old flow used `subject: account.id`, which is the same semantic move as the current `sub = vana_user_id` decision. It also used an introspection bridge: `ory_at_` tokens were introspected through Hydra Admin and exchanged into Vana API JWTs. That remains useful if account APIs want Vana-shaped JWTs while the OAuth issuer keeps opaque access tokens.

Parts not to reuse directly:

- `oryd/hydra:v2.1.2` or `v2.0.3`.
- 168-hour access and ID token TTLs.
- committed dev clients and hardcoded development URLs.
- public/SPAs using `client_secret`; public clients should use Authorization Code + PKCE without a secret.
- Hasura-specific JWT claims, `*@vana.com` admin heuristics, guest-by-IP account creation, and signup-credit side effects inside login challenge handling.
- the old Cloud Run deploy script as-is; it appears to compare the string `admin` with numeric `-eq`.
- the old trait-specific consent UI unless the same product semantics still apply.

### Current Hydra status

Research says Hydra remains a strong 2026 fit. The current OSS target is `v26.2.0+`; Ory Network/OEL have newer patch releases. Since `v2.1.2`, relevant changes include:

- `v2.2.0`: major performance improvements over `2.1`.
- `v2.3.0`: graceful refresh-token rotation and stricter OIDC compliance around `redirect_uri`.
- `v25.4.0`: calendar-style unified versions, OAuth 2.1 discovery, device authorization grant, consent-token-chain revocation, and Postgres UUID migration changes requiring `uuid-ossp`.
- `v26.2.0`: minimum target due to Hydra CVE-2026-33504 affecting some Admin list APIs in older versions.

Hydra still delegates login and consent to a Vana-owned app and accepts login with an explicit `subject`, so it directly supports `sub = vana_user_id`.

### Hydra v26 POC is runnable

Claude worker `cc-hydra-poc` completed a self-contained local POC on branch `worktree-hydra-v26-poc`; the imported artifact lives at `spikes/hydra-v26-poc/`.

The POC uses:

- `oryd/hydra:v26.2.0`
- disposable Postgres
- Hydra public/admin services with `config/hydra.yml` as the config source of truth
- a minimal Vana-owned login/consent stub
- a public PKCE client with `token_endpoint_auth_method: "none"`
- a dependency-free Node smoke script

The smoke script proves:

- discovery and JWKS endpoint reachability
- Authorization Code + PKCE happy path
- negative missing-`code_challenge` behavior for the public client
- login challenge acceptance with `subject = vana_user_dev_123`
- consent challenge acceptance with a custom `vana_user_id` ID-token claim
- ID token payload has `sub = vana_user_dev_123`
- `/userinfo` returns the same subject and fails the smoke test on mismatch
- admin introspection returns `active=true`, the same subject, and expected scopes
- refresh preserves the subject

Important limitation: the POC fetches JWKS but does not verify the ID token signature against JWKS. It also uses an auto-login and auto-grant consent stub. It proves issuer control, subject semantics, PKCE behavior, and local service wiring, not production authentication, consent UX, key rotation, revocation, or deployment hardening.

Production blockers:

- prove `hydra migrate sql` on a production-like Postgres snapshot
- enable/check `uuid-ossp` before `v25.4+` migrations
- keep Admin private and never browser-accessible
- set strong `secrets.system`, `secrets.cookie`, and dedicated `secrets.pagination`
- decide opaque vs JWT access tokens per resource server
- configure refresh-token rotation/grace and test concurrent refresh
- preserve issuer stability; changing `urls.self.issuer` is client-breaking

### `oidc-provider` route-handler spike is useful but not the default

Claude worker `cc-account-oidc` completed branch `worktree-account-oidc-provider-mount-spike` at commit `cda0b6251`.

The spike proved:

- discovery and JWKS can be served through a Next route handler
- auth redirects, cookies, token POSTs, and CORS can pass through the bridge
- `oidc-provider@9.8.3` can run behind a custom Web `Request`/`Response` to Node HTTP bridge

It also showed the cost:

- custom Web-to-Node/Koa bridge
- `req.originalUrl` and forwarded-header shims
- response socket/event shims
- in-memory adapter replacement required
- stable signing keys required
- cookie key rotation required
- persistent client storage required
- real interactions required
- Vercel multi-instance behavior still unproven

The result should be preserved as evidence, not merged as the default architecture.

### Managed issuer options remain open

Research packets point to Ory/Hydra as the cleanest architectural fit when `sub = vana_user_id` and Vana-owned login/consent are non-negotiable.

WorkOS Connect/AuthKit and Stytch Connected Apps are plausible managed escape hatches if they can satisfy:

- issuer/custom domain can be `account.vana.org`
- token `sub` can be exactly `vana_user_id`
- Privy custom JWT can trust the resulting issuer/JWKS
- consent/action UX does not collapse into provider-owned semantics
- app/client registration and audit events are sufficient

Auth0, Clerk, FusionAuth, Zitadel, and SuperTokens remain credible products, but they look less aligned if they own the subject identifier or require using a custom claim instead of `sub`.

Managed issuer POC pass/fail tests:

- `/.well-known/openid-configuration` and token `iss` equal exactly `https://account.vana.org`.
- Test user `u_123` receives ID/access token with `sub === "u_123"`, not a vendor user id.
- Existing Vana auth remains the source of truth and resumes the OAuth request with original parameters.
- Vana can control the consent/action UI enough to show actor, action, account, scopes, expiry, consequence, cancel, and deterministic return states.
- Custom scopes/resources can be registered, requested, granted, denied, and reflected in tokens.
- Refresh tokens and revocation behavior are explicit and testable.
- Audit/export can answer who authorized which app, scopes, time, and revocation state.
- Privy custom JWT accepts the issuer/JWKS and uses the Vana subject as its custom-auth user id.

Known WorkOS risks:

- token `sub` may be WorkOS-style `user_*` rather than the external Vana user id
- consent may be WorkOS-rendered or limited to dynamic enum options rather than fully Vana-owned

Known Stytch risks:

- Trusted Auth Token `sub` may map to an external id while Connected App tokens still use Stytch `user_id`
- custom issuer/domain and headless consent behavior need POC confirmation

## Next Work Packets

1. Complete Ory Hydra prior-art audit from local repos and GitHub. Done.
2. Verify current Hydra/Ory Network version, migration, and deployment posture from primary docs. Done enough for a local POC; production deployment remains.
3. Define pass/fail POC criteria for WorkOS and Stytch. Done.
4. Run one issuer POC before implementing account OIDC endpoints. Done via `spikes/hydra-v26-poc/`.
5. Preserve the `oidc-provider` spike branch as fallback evidence; do not merge without an explicit architecture decision.

Immediate next implementation packets:

1. Account integration POC: wire account login/consent routes to Hydra challenges using current Privy-native login transitionally.
2. Production issuer decision: choose self-hosted Hydra, Ory Network, managed issuer, or `oidc-provider` sidecar fallback with explicit pass/fail criteria.
3. Managed issuer verification: contact or test WorkOS/Stytch for exact `sub` and issuer-domain behavior before investing implementation time.
4. Resource-server policy: decide opaque token introspection vs JWT access tokens for account APIs and future first resource server.
5. Live-infra safety check: verify whether any old Hydra admin service is still reachable or was ever deployed unauthenticated due to the old `deploy-hydra.sh` string-comparison bug.

## Confidence

Confidence: 0.96.

High confidence:

- prior Vana Hydra art exists
- `oidc-provider` Next route-handler mount is possible but carries owned bridge complexity
- `sub = vana_user_id` remains the key issuer requirement
- OIDC tokens must remain separate from data-action authorization

Medium confidence:

- exact Ory Hydra migration effort from `v2.1.2`
- whether Ory Network can preserve all desired issuer/custom-domain semantics faster than self-hosted Hydra
- whether WorkOS/Stytch can issue exactly the desired subject and integrate cleanly with Privy
