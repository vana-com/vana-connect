## Context

Current account app facts:

- `connect/src/app/_components/app-providers.tsx` uses `@privy-io/react-auth` and creates embedded Ethereum wallets on login for users without wallets.
- `/login` supports Privy email OTP and Google/Apple OAuth.
- `/connect` requires Privy auth, ensures an embedded wallet exists, signs `vana-master-key-v1`, and creates a DataConnect deep link.
- `/connect`, `/server`, and `/auth/device` already request silent embedded-wallet signatures with `showWalletUIs: false`.
- `/api/sign` recovers a wallet from `vana-master-key-v1`, looks up the Privy embedded wallet, and uses Privy server-side signing for allowlisted payloads.
- Admin app registration already generates a builder keypair and registers a builder with Gateway.
- Existing OpenSpec `account-domain-identity-issuer` defines a minimal JWT/JWKS issuer with wallet-address `sub`; this is now too narrow for the current target.
- The repo is linked to Vercel projects, so OIDC library integration should be checked against Vercel/Next deployment constraints before choosing sidecar vs route-handler integration.
- Vana previously built an OAuth/OIDC service around Ory Hydra in `vana-com/vana-oauth`, with public/admin surfaces, Postgres persistence, and account-owned login/consent callbacks. `vana-gotchi-js-api` and `vana-gotchi-pwa` contain the prior login, consent, PKCE, token introspection, and Vana-token exchange integration.
- A Claude worker completed an `oidc-provider@9.8.3` Next route-handler mount spike on branch `worktree-account-oidc-provider-mount-spike` at commit `cda0b6251`. It proved the route-handler bridge is possible, but it also required a custom Web-to-Node/Koa bridge and left production gaps around persistent adapters, key rotation, cookie keys, client storage, and interactions.
- A Claude worker completed a local Hydra `v26.2.0` POC under `spikes/hydra-v26-poc/` on branch `worktree-hydra-v26-poc` at commit `354eb4051`. It proves discovery, JWKS retrieval, Authorization Code + PKCE, negative missing-`code_challenge` rejection for a public client, Vana-owned login/consent callback control, `sub = vana_user_id`, userinfo, admin introspection, and refresh against disposable Postgres.

## Confidence

Overall confidence: **0.95**.

High-confidence points:

- `account.vana.org` is the right implementation home unless integration proves otherwise.
- OIDC should be implemented as a standard provider shape so NextAuth/Auth.js and other standard clients can consume it.
- `sub` should be a Vana-owned account id, not provider id and not necessarily wallet address.
- Wallet addresses should be linked capabilities/claims under the Vana account.
- Data-action authorization must be separate from OIDC login.
- The first implementation should use the current Privy-native login transitionally rather than replacing login before the OIDC/action-code spike.
- The first Memory App action result should be mock-only.
- The first non-mock data result should be an encrypted bundle behind a short-lived reference.
- Account-local consent/action events are the right first protocol seam; live DP RPC writes should not block the auth spike.
- Ory Hydra is no longer an abstract option; it is prior Vana art and should be evaluated before adopting a new self-hosted issuer implementation.
- The local Hydra `v26.2.0` POC proves the basic issuer control path is executable; the remaining Hydra question is production service shape, migration, and operations, not whether the subject/login/PKCE model is possible.
- `oidc-provider` remains credible as a Node authorization-server engine, but the Next route-handler mount should be treated as fallback evidence rather than the default production path.

Lower-confidence points:

- Whether to repurpose self-hosted Ory Hydra, use Ory Network, or choose a managed issuer such as WorkOS/Stytch for the first production cut.
- The exact production Memory App deployment, if it is not the dev fixture used for the spike.

External references checked:

- Privy JWT-based auth overview: <https://docs.privy.io/authentication/user-authentication/jwt-based-auth/overview>
- Privy authentication overview: <https://docs.privy.io/security/authentication/user-authentication>
- Privy global wallet overview: <https://docs.privy.io/wallets/global-wallets/overview>
- `oidc-provider`: <https://oidc-provider.dev/>
- Ory Hydra prior Vana repo: `vana-com/vana-oauth`

## Goals / Non-Goals

**Goals:**

- Implement Login with Vana as an OIDC-compatible account-domain surface.
- Keep Privy behind a Vana-owned identity and wallet-provider adapter.
- Make Memory App a concrete first client.
- Define account-hosted data actions without conflating them with OIDC scopes.
- Define embedded-wallet and BYO-wallet execution modes separately.
- Preserve the existing DataConnect handoff until it is intentionally migrated.
- Define enough data model and tests that implementation agents can work independently.

**Non-Goals:**

- Do not implement a full Personal Server.
- Do not require Context Gateway changes.
- Do not define final DP RPC or L1 contract formats here.
- Do not migrate legacy Para Vana App users.
- Do not turn `/api/sign` into the long-term action surface.

## Decisions

### D1. OIDC issuer is required; issuer implementation is a decision gate

The account app should expose a standard OIDC provider surface:

- `/.well-known/openid-configuration`
- `/.well-known/jwks.json`
- `/oauth2/authorize`
- `/oauth2/token`
- `/oauth2/userinfo`
- `/oauth2/revoke`
- optional `/oauth2/introspect` if resource servers need it

Authorization Code + PKCE is required for web and native clients. Client credentials or private-key JWT can be added later for confidential server-to-server operations.

The next implementation gate is choosing the issuer shape, not writing endpoints directly in Next.js.

Current ranking:

1. **Evaluate repurposed Ory Hydra / Ory Network first.** Vana has prior Hydra art, and Hydra naturally matches the desired separation: standard OAuth/OIDC public endpoints, a protected admin API, Vana-owned login and consent UX, Postgres persistence, and explicit subject assignment. A local `oryd/hydra:v26.2.0` POC now proves the basic subject, PKCE, login/consent, userinfo, introspection, and refresh flow. Do not reuse the old `oryd/hydra:v2.1.2` image directly; the remaining Hydra gates are production deployment shape, migration proof, key/secret management, admin isolation, and resource-server token policy.
2. **Evaluate managed issuer options where they preserve the Vana identity boundary.** WorkOS Connect/AuthKit and Stytch Connected Apps are worth a focused POC if they can issue `sub = vana_user_id`, support `account.vana.org` as the issuer/custom domain, integrate with Privy custom JWT auth, and avoid taking over consent/action semantics.
3. **Keep `oidc-provider` as a self-hosted Node fallback, preferably outside Next route handlers.** The completed spike proves a Vercel/Next route-handler bridge can work for discovery, JWKS, auth redirect, token POST, cookies, and CORS. It also shows that this path creates custom HTTP lifecycle code Vana would own. If `oidc-provider` is chosen, a dedicated Node/Fastify sidecar is likely cleaner than embedding a Koa bridge in Next.

Do not hand-roll OIDC protocol behavior. Do not merge the Next route-handler `oidc-provider` spike as production architecture unless Ory/managed options fail documented pass/fail criteria.

### D2. OIDC subject is `vana_user_id`

Use a Vana-owned account id as `sub`.

Wallet addresses are linked account capabilities, not the sole account subject:

```json
{
  "sub": "vana_user_...",
  "wallets": [
    {
      "address": "0x...",
      "chainType": "evm",
      "provider": "privy",
      "primary": true
    }
  ]
}
```

This preserves:

- multiple wallets per user
- provider migration
- future self-custody
- future account abstraction
- non-wallet account recovery

Protocol code can still use wallet addresses where the protocol requires wallet identity.

### D3. Privy is first wallet provider behind Vana auth

Target state: Vana authenticates the user, issues a Vana JWT, and Privy accepts that JWT through its custom auth path to provide embedded-wallet access.

First implementation state: use the current Privy-native login transitionally. The account app already uses Privy email/OAuth, embedded wallet creation, silent client-side signing, and server-side Privy signing. Replacing all of that with Vana-native login plus Privy custom JWT before OIDC is working would combine two migrations.

The first OIDC slice should authenticate through current Privy login, then create or resolve a Vana account and linked wallet before issuing any Vana OIDC token. This must be explicitly labeled transitional and must not make `privy_user_id` the durable subject.

### D4. OIDC login scopes are not data grants

OIDC scopes describe identity/account/API access, for example:

- `openid`
- `profile`
- `email`
- `wallets`
- `account.actions`

Data requests must use a separate account-hosted action or protocol consent flow. Do not represent `read:chatgpt.conversations` as ordinary OIDC login scope unless it is only a request to start a separate data action.

### D5. A dev Memory App fixture is the first OIDC client

Create a configured dev fixture/client for Memory App:

- `client_id`
- redirect URIs
- allowed origins
- allowed account scopes
- whether it is public or confidential
- display name and branding
- optional mapped protocol principal

For the first spike, do not block on finding or changing a production Memory App repo. Use a local fixture that exercises Login with Vana and action-code exchange. The fixture can be an Auth.js/NextAuth relying-party app if that is the fastest way to prove compatibility, but the account issuer must still support Authorization Code + PKCE for future public web/native clients.

### D6. Account-hosted data actions use request/result codes

Do not pass data through OAuth redirects.

Use a separate action flow:

1. Memory App creates an action request with `account.vana.org`.
2. Account returns an action URL.
3. User opens the action URL and authenticates if needed.
4. Account shows the requested data action and gets approval.
5. Account returns a mock result for the first spike.
6. Account stores a short-lived action result record.
7. Account redirects back with `action_code` and `state`.
8. Memory App exchanges `action_code` for the result or reference using client authentication / PKCE-compatible proof.

This is closer to Stripe Checkout than to an OAuth scope grant.

First implementation state: the action result mode is `mock`. This proves request creation, approval/denial, redirect safety, code exchange, client binding, expiration, and persistence without introducing plaintext or real storage/protocol dependencies.

### D7. Action requests must record plaintext behavior

Each action type must specify:

- requested data categories/scopes
- requesting client
- user-facing explanation
- result mode: mock, plaintext, encrypted bundle, or short-lived reference
- where decryption occurs
- whether any Vana/ODL backend sees plaintext
- expiration
- revocation/cancellation behavior
- audit/consent record shape

For the first Memory spike, use a mock result.

For the first non-mock result, use an encrypted bundle behind a short-lived reference:

- Account-hosted browser or another reviewed user-present context decrypts user data.
- The result is encrypted to the registered client/app public key before upload or server-side storage.
- Account backend storage sees ciphertext and metadata only.
- The client receives `action_code`, exchanges it, and receives a short-lived reference or encrypted payload.
- Plaintext may exist in the account browser context and the receiving client/runtime after decryption.
- Plaintext must not be placed in redirect parameters or stored in account backend tables unless a later design explicitly approves that.

### D8. Existing routes are preserved

The first implementation should not break:

- `/login`
- `/connect`
- `/auth/device`
- `/api/auth/device/*`
- `/api/sign`

If these routes receive additive fields, old clients must be able to ignore them.

### D9. Application records and protocol principals are separate

Account app should store OIDC/application metadata independently from builder/protocol principal metadata.

It is acceptable if the first cut maps multiple applications to one builder-level protocol principal, but the data model should support moving to one protocol principal per application later.

### D10. Action execution mode is explicit

Account-hosted actions must not assume every user wallet can be driven by account backend APIs.

For Privy embedded wallets under `account.vana.org`, an action may be silent, user-present, or provider-policy dependent. The implementation must document which case applies per action type.

For BYO wallets, especially external or hardware wallets, signing happens through the user's wallet flow. The account app can coordinate the action, verify signatures, issue action codes, and record audit events, but it cannot silently sign on the user's behalf.

The account API should therefore persist or derive an action execution mode:

- `mock`
- `embedded_wallet_account_hosted`
- `byo_wallet_client_signed`
- future `delegated_runtime`

This lets Memory App and future clients call one account action API while preserving the correct wallet behavior internally.

First implementation state: use `mock` execution mode. Embedded-wallet account-hosted actions and BYO-wallet client-signed actions should be represented in the model but are not required for the first OIDC/action-code proof.

### D11. Consent/action event contract is explicit

`account_consent_events` is the first DP RPC-compatible seam. The first implementation should persist account-local records with enough structure to support later DP RPC writes or L1 anchoring.

Minimum event fields:

- `event_id`
- `schema_version`
- `event_type`: `action.requested`, `action.approved`, `action.denied`, `action.completed`, `action.exchanged`, or `action.expired`
- `occurred_at`
- `issuer`: `account.vana.org`
- `vana_user_id`
- `subject_wallet_address`, nullable
- `client_id`
- `application_id`, nullable if client id is the only first-slice app identity
- `protocol_principal`, nullable object with `builder_id`, `grantee_address`, or future app principal
- `action_request_id`
- `action_type`
- `requested_data`, including connector/source id, streams/scopes, purpose code/description, fields, time range, and access mode when known
- `decision`, nullable except approve/deny events
- `execution_mode`
- `result_mode`
- `authorization_reference`, nullable object for future grant id, permission id, file ids, or action code hash
- `idempotency_key`
- `request_hash`, a canonical hash of the user-visible action request
- `audit_metadata`, including user agent, IP-derived risk metadata if retained, and provider-link reference if applicable

Do not invent protocol ids before the protocol write exists. Nullable protocol reference fields are preferable to fake `grant_id` / `permission_id` values.

## Proposed Data Model

Minimum new or revised tables:

- `vana_users`: `id`, timestamps, status.
- `vana_linked_wallets`: `vana_user_id`, wallet address, chain type, provider, provider wallet id, primary flag, verified timestamp.
- `vana_provider_links`: `vana_user_id`, provider, provider subject, audit metadata.
- `oauth_clients`: client id, client type, redirect URIs, allowed origins, allowed scopes, display metadata, owner/developer reference.
- `oauth_authorization_codes`: code hash, client id, user id, redirect URI, code challenge, nonce, scopes, expiry, consumed timestamp.
- `oauth_refresh_sessions`: hashed refresh token, client id, user id, scopes, expiry, rotation/revocation fields.
- `account_action_requests`: request id, client id, user id if known, requested action type, execution mode, requested data, redirect URI, state hash, status, expiry.
- `account_action_results`: action code hash, request id, result mode, result pointer or encrypted payload reference, expiry, consumed timestamp.
- `account_consent_events`: event id, schema version, event type, timestamp, issuer, user id, wallet address, client id, protocol principal refs, action request id, requested data, decision, execution mode, result mode, authorization refs, idempotency key, request hash, audit metadata.

Do not overload the existing CLI `device_codes` / `sessions` tables for OAuth or action-result state.

## First Implementation Slice

Recommended first slice:

1. Finish the issuer decision gate: Ory Hydra prior-art audit, Hydra current-version POC, and managed issuer POC criteria are complete; the remaining decision is self-hosted Hydra vs Ory Network vs managed issuer.
2. Select the issuer shape with evidence: self-hosted Hydra, Ory Network, WorkOS/Stytch, or `oidc-provider` sidecar fallback.
3. Add static OIDC client config for Memory App in dev.
4. Add OIDC discovery/JWKS and authorization-code flow with PKCE through the chosen issuer shape.
5. Resolve Vana user from current Privy login as transitional auth.
6. Issue ID/access tokens with `sub = vana_user_id` and linked wallet claim.
7. Add a mocked account-hosted data action request/result flow.
8. Add explicit execution-mode handling so the mock path does not imply silent signing for BYO wallets.
9. Persist consent/action events using the minimum event contract above.
10. Add tests against a minimal NextAuth/Auth.js client or a standards-compatible OIDC client test harness.

This proves the auth shape before real DP RPC/storage work.

## Owner Acceptance Bar

The first slice is not complete until these are true:

- A standard OIDC relying party can complete Authorization Code + PKCE against `account.vana.org`.
- A NextAuth/Auth.js fixture or equivalent standard client proves discovery, JWKS, authorization, token exchange, userinfo, state, nonce, and PKCE behavior.
- Tokens use `sub = vana_user_id`; tests prove Privy ids, emails, Google subjects, and wallet addresses are not used as `sub`.
- Current `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, and `/api/sign` flows still pass regression tests.
- Memory App fixture receives only `action_code` through redirect and only mock data through exchange.
- No raw user data is passed through redirect params.
- Consent/action events are persisted for request, approve, deny, complete, exchange, and expiry paths where applicable.
- The first non-mock result path is blocked behind explicit result-mode handling; it cannot silently fall back to backend plaintext.
- BYO-wallet action mode cannot call backend silent signing.
- The implementation has an idempotency strategy for authorization codes, action codes, and consent/action event writes.
- The PR description names remaining production gaps instead of burying them in implementation notes.

## Open Questions

- Should the issuer be repurposed self-hosted Ory Hydra, Ory Network, WorkOS/Stytch, or `oidc-provider` sidecar fallback?
- If Ory Hydra is revived, should the prior Cloud Run public/admin split be reused, or should the service run in a newer platform shape?
- If self-hosted Hydra is revived, do we use opaque access tokens plus introspection by default, or JWT access tokens for selected resource servers?
- Which service owns Hydra admin operations: `account.vana.org`, a small admin adapter service, or a separate deployment/ops lane?
- What is the best local fixture shape and redirect URI for the dev Memory App / Auth.js compatibility test?
- Which wallet execution modes are in scope after the mock first spike?
- Which downstream service is the first resource server for access tokens?
- What token lifetimes and refresh behavior do we want for web and native clients?
- What claims should expose wallets without making wallet address the OIDC subject?
