## 1. Review Decisions

- [ ] 1.1 Confirm `vana_user_id` as OIDC `sub`; wallet addresses are linked claims.
- [ ] 1.2 Review the closed first-slice auth bridge decision: current Privy-native login is transitional and must resolve `vana_user_id` before issuing OIDC tokens.
- [ ] 1.3 Confirm target-state Privy custom JWT auth as the provider architecture.
- [ ] 1.4 Confirm local fixture shape, redirect URIs, and first environments for the dev Memory App / Auth.js compatibility test.
- [ ] 1.5 Review the closed first-spike action-result decision: mock result only.
- [ ] 1.6 Review the closed first-spike wallet execution-mode decision: `mock`; embedded-wallet and BYO-wallet actions are modeled but not first-spike dependencies.
- [ ] 1.7 Review the closed first non-mock result-mode decision: encrypted bundle behind a short-lived reference.
- [ ] 1.8 Review the closed consent/action event decision: account-local DP RPC-compatible events before live DP RPC writes.
- [ ] 1.9 Confirm the revised issuer decision gate: Ory/Hydra prior art and managed issuer POCs before production OIDC implementation.
- [ ] 1.10 Review the completed `oidc-provider` route-handler spike as fallback evidence, not default architecture.

## 2. OIDC Issuer Decision

- [x] 2.1 Complete `oidc-provider` Next route-handler mount spike as evidence (`worktree-account-oidc-provider-mount-spike`, commit `cda0b6251`).
- [x] 2.2 Record the `oidc-provider` spike decision: possible, but custom Web-to-Node/Koa bridge plus production gaps make it a fallback path.
- [x] 2.3 Audit prior Vana Ory Hydra implementation across `vana-oauth`, `vana-gotchi-js-api`, `vana-gotchi-pwa`, and `kubernetes-services`.
- [x] 2.4 Verify current Ory Hydra / Ory Network viability, including version upgrade path from `oryd/hydra:v2.1.2`, subject control, custom domain/issuer, Postgres, key rotation, login/consent, and Cloud Run/admin isolation.
- [x] 2.5 Define pass/fail POC criteria for managed issuer options, at minimum WorkOS Connect/AuthKit and Stytch Connected Apps.
- [x] 2.6 Select issuer shape before implementing production endpoints: Ory Hydra is the implementation path for the next slice; Ory Network or a managed issuer remains available if deployment/security review blocks self-hosted Hydra.
- [x] 2.7 Run a Hydra `v26.2.0+` migration/config POC against disposable Postgres (`spikes/hydra-v26-poc/`, worker commit `354eb4051`).
- [x] 2.8 Run one managed issuer POC or vendor confirmation for exact `sub = vana_user_id` and exact `https://account.vana.org` issuer support. Ory Network is confirmed from official docs for issuer URL/custom-domain support plus app-controlled login subject; WorkOS and Stytch remain fallback candidates pending vendor confirmation for customer-controlled `sub` (`openspec/changes/account-oidc-privy-actions/design-notes/managed-issuer-confirmation-2026-04-29.md`).
- [x] 2.9 Add production-code Hydra admin adapter seam and tests (`connect/src/lib/auth/hydra-admin.ts`) without wiring App Router login/consent routes yet.

## 3. OIDC Provider Surface

- [ ] 3.1 Implement `/.well-known/openid-configuration` through the chosen issuer shape.
- [ ] 3.2 Implement or configure `/.well-known/jwks.json`.
- [ ] 3.3 Implement `/oauth2/authorize` with Authorization Code + PKCE.
- [ ] 3.4 Implement `/oauth2/token` for authorization code exchange.
- [ ] 3.5 Implement `/oauth2/userinfo`.
- [ ] 3.6 Implement `/oauth2/revoke`.
- [ ] 3.7 Add issuer, client, redirect URI, state, nonce, and PKCE tests.
- [x] 3.8 Add a NextAuth/Auth.js compatibility test or fixture (`spikes/oidc-rp-fixture/` plus `connect/src/lib/auth/oidc-rp-fixture.test.ts`; this is a config/shape fixture, not a headed RP app).

## 4. Vana Account Model

- [x] 4.1 Add `vana_users` migration (`connect/migrations/004_add_vana_account_tables.sql`).
- [x] 4.2 Add `vana_linked_wallets` migration (`connect/migrations/004_add_vana_account_tables.sql`).
- [x] 4.3 Add `vana_provider_links` migration (`connect/migrations/004_add_vana_account_tables.sql`).
- [x] 4.4 Add typed DB helpers for creating/resolving Vana users from provider auth and linked wallet (`connect/src/lib/auth/vana-account.ts`, `connect/src/lib/db/account.ts`). Runtime integration with OIDC routes is pending.
- [x] 4.5 Add tests proving provider ids, email, and wallet addresses are not used as OIDC `sub` (`connect/src/lib/auth/vana-account.test.ts`).
- [x] 4.6 Add userinfo/claim tests for linked wallets (`buildAccountClaims` test in `connect/src/lib/auth/vana-account.test.ts`).
- [x] 4.7 Harden `resolveVanaUserByPrivyEvidence` for concurrent first login using a read-committed transaction, sorted advisory locks over provider and wallet evidence keys, and CTE-backed upserts (`connect/src/lib/db/account.ts`).
- [x] 4.8 Add DB-backed concurrency tests for same provider, same wallet, provider backfill, provider-wallet conflict, and different providers sharing one wallet; skip unless `DATABASE_URL` is set (`connect/src/lib/db/account.test.ts`).

## 5. OAuth Client Model

- [x] 5.1 Add `oauth_clients` migration or static dev client config for the first slice (`connect/src/lib/auth/oauth-client-policy.ts`: static `OauthClientRecord` registry via `createDefaultOauthClientRegistry`).
- [x] 5.2 Register the dev Memory App fixture as the first client (`DEV_MEMORY_APP_CLIENT` with `client_id = "memory-app-dev"`).
- [x] 5.3 Add redirect URI and origin allowlist checks. Pure helpers `checkRedirectUri` and `checkOrigin` in `connect/src/lib/auth/oauth-client-policy.ts` enforce exact-match against `client.redirectUris` / `client.allowedOrigins`, reject blank, malformed, protocol-relative, CRLF, and non-http(s) inputs, and require https except for loopback hosts (`localhost`, `127.0.0.1`, `::1`). Tests in `connect/src/lib/auth/oauth-client-policy.test.ts` cover allow/deny paths, including the dev Memory App localhost redirect URIs and origins. No production `/oauth2/authorize` route is wired yet (that work lives behind tasks 3.3 and the Hydra client-config integration); enforcement is currently a pure policy seam ready for the route handler to consume.
- [x] 5.4 Add client display metadata for consent/action screens (`displayName` field on `OauthClientRecord`).
- [x] 5.5 Add future field for linked protocol principal without requiring it in the first slice (`protocolPrincipal?: { kind, id }` on `OauthClientRecord`).

## 6. Privy Provider Boundary

- [x] 6.1 Define provider adapter interface for current Privy-native session resolution (`connect/src/lib/auth/login-session-adapter.ts`: `LoginSessionAdapter`, `LoginEvidence`, `createPrivyLoginSessionAdapter`).
- [x] 6.2 Resolve embedded wallet address from current Privy session and create linked wallet records (`pickEmbeddedEvmWallet` requires Privy-issued `wallet_client_type` / `wallet_client`; OIDC login route forwards evidence to `resolveVanaUserByPrivyEvidence`).
- [x] 6.3 Document the transitional nature of Privy-native login if used (file-level docstring on `login-session-adapter.ts` and adapter export comment).
- [x] 6.4 Define target Privy custom JWT auth integration path. Boundary types, validators, and a `PrivyCustomAuthClient` interface live in `connect/src/lib/auth/privy-custom-auth.ts`; tests in `connect/src/lib/auth/privy-custom-auth.test.ts` prove that Privy native subjects, emails, and wallet addresses cannot be used as the OIDC `sub`, that the result binding is verified, and that Privy-native sessions are not silently coerced into custom-auth identity without a confirmed migration. No SDK calls or routes are wired yet; the transitional Privy-native login adapter is unchanged.
- [x] 6.5 Add tests that downstream OIDC tokens contain Vana account subject, not Privy subject (`connect/src/lib/auth/oidc-routes.test.ts` rejects provider subjects before Hydra login/consent accept, and `connect/src/lib/auth/hydra-admin.test.ts` asserts Vana user ids in Hydra subject/session claims).

## 7. Account-Hosted Action Requests

- [x] 7.1 Add `account_action_requests` migration (`connect/migrations/005_add_account_action_tables.sql`).
- [x] 7.2 Add `account_action_results` migration (`connect/migrations/005_add_account_action_tables.sql`).
- [x] 7.3 Add `account_consent_events` migration (`connect/migrations/005_add_account_action_tables.sql`).
- [x] 7.4 Implement action request creation for registered clients. `POST /api/account/actions` validates `client_id` against `createDefaultOauthClientRegistry()`, validates `redirect_uri` via `checkRedirectUri()`, and rejects non-`mock` `execution_mode` / `result_mode` with stable 400 codes (`unsupported_execution_mode`, `unsupported_result_mode`). The pure handler `handleCreateActionRequest` in `connect/src/lib/auth/account-action-routes.ts` persists the row via `insertActionRequest`, persists an `action.requested` consent event with `vana_user_id = null` (idempotency_key `${id}:requested`, request_hash from `canonicalRequestHash`), and returns `action_request_id`, `action_url`, and `expires_at`. Raw state is never written to the DB row; if supplied it is round-tripped through the browser via the `action_url` query string, analogous to OAuth `state`. Route tests in `connect/src/app/api/account/actions/account-actions-routes.test.ts` cover unknown client, bad redirect, mode rejection, response shape, and the no-raw-data-in-redirect invariant. Handler tests in `connect/src/lib/auth/account-action-routes.test.ts` cover branch logic.
- [x] 7.5 Persist explicit action execution mode: first `mock`, later `embedded_wallet_account_hosted`, `byo_wallet_client_signed`, or future `delegated_runtime` (schema fields plus pure model helpers in `connect/src/lib/auth/account-action.ts`; DB persistence in `connect/src/lib/db/account-actions.ts`; route endpoints reject non-`mock` approval before mutation in this first slice).
- [x] 7.6 Implement action page that requires login and displays client/action details. `GET /api/account/actions/[id]` now requires Privy login evidence, resolves the caller to a `vana_user_id`, rejects requests already bound to a different user, and returns a display-safe action detail payload with client display name, action type, execution/result mode, requested data, display metadata, status, and expiration. The raw `state_hash`, `vana_user_id`, and redirect URI are not returned by the display API. `/account/actions/[id]` uses the existing Privy login modal when unauthenticated, fetches the protected detail payload with the identity token, displays the request, and calls the approve/deny decision endpoint while preserving browser-carried `state`. Tests cover the pure handler, App Router GET route, login prompt, details load, identity-token authorization header, and approve-with-state POST.
- [x] 7.7 Implement approve/deny handling. DB-backed persistence: `persistActionDecisionBundle` in `connect/src/lib/db/account-actions.ts` performs the `pending`-gated request update plus dependent result/event inserts in one data-modifying CTE statement, so approval cannot commit without the mock result and `action.approved` event, and denial cannot commit without `action.denied`. App Router endpoint wired: `POST /api/account/actions/[id]/decision` resolves `vana_user_id` only from `LoginEvidence` via `createPrivyLoginSessionAdapter` (never from request body/query), validates the resolved subject is an opaque Vana user id, 401s without evidence, 404s for unknown ids, 403s when the request is bound to a different user, 409s when the pending gate fails, and rejects non-`mock` approval before mutation. On approve it issues a single-use action code via `generateActionCode`, persists the decision/result/event bundle atomically, and returns a redirect URL whose query is exactly `action_code` (and `state` only when state was originally set and re-supplied). On deny it persists the decision/event bundle atomically and returns a redirect URL with no `action_code`. State binding: the decision body must re-supply raw state, which is verified against the persisted `state_hash` before any decision is persisted. Tests in `connect/src/lib/auth/account-action-routes.test.ts`, `connect/src/app/api/account/actions/account-actions-routes.test.ts`, and DB-backed `connect/src/lib/db/account-actions.test.ts`.
- [x] 7.8 Implement redirect back with `action_code` and `state`. The decision route returns a JSON body with `redirect_url`. State is round-tripped via the browser only: `POST /api/account/actions` returns an `action_url` that includes `?state=<encoded>` when state was supplied (raw state is never persisted; the row stores only `state_hash`). The decision route requires the caller to re-present that state, verifies its sha256 matches `state_hash`, and only then includes `state` on the approval redirect. Denial redirects carry `state` (when present) but never `action_code`. Approval redirects carry exactly `action_code` and optional `state` — no other params, no user data, no requested_data. Asserted by `account-action-routes.test.ts` and `account-actions-routes.test.ts`.
- [x] 7.9 Implement action-code exchange with client binding and expiration. `consumeActionCode` in `connect/src/lib/db/account-actions.ts` performs hash-match, client-binding, expiry, and not-yet-consumed checks inside a single `UPDATE ... RETURNING`; concurrent and replayed exchanges produce exactly one success. Production route wiring uses `consumeActionCodeWithExchangeEvent`, which consumes the code and inserts `action.exchanged` in the same SQL statement, selecting the prior request hash from the approved/requested consent event so exchange cannot deliver a result without the exchange audit event. DB-backed tests in `connect/src/lib/db/account-actions.test.ts` (skipped without `DATABASE_URL`) prove single-success-under-concurrency, wrong-client rejection, expiry rejection, raw-code non-storage, bundled decision persistence, and bundled exchange-event persistence. App Router endpoint wired: `POST /api/account/actions/exchange` validates `client_id` against the registry, calls the bundled consume helper, and on success returns `action_request_id`, `result_mode`, `result_payload`, `result_reference`, and `expires_at`. Failure modes fold to stable OAuth-ish errors: `expired` → `expired_grant`, all of `not_found`/`client_mismatch`/`consumed` → `invalid_grant` (so a caller cannot probe for code existence). The persisted `action_code_hash` is never returned to the OAuth client. Tests cover unknown client, missing code, success shape, bundled exchange delegation, and failure mapping.
- [x] 7.10 Add tests proving no raw user data is sent through redirect parameters (`connect/src/lib/auth/account-action.test.ts`).
- [x] 7.11 Add tests proving BYO-wallet action requests require client/user wallet signing rather than backend silent signing (`connect/src/lib/auth/account-action.test.ts`).
- [x] 7.12 Add tests proving account-local consent/action events include the minimum DP RPC-compatible fields (`connect/src/lib/auth/account-action.test.ts`).
- [x] 7.13 Add tests proving first non-mock result mode must be encrypted bundle plus short-lived reference unless explicitly overridden by config/design (`connect/src/lib/auth/account-action.test.ts`).

## 8. Memory App Spike

- [x] 8.1 Implement a dev Memory App or Auth.js client fixture (`spikes/oidc-rp-fixture/` defines the `memory-app-dev` Auth.js/OpenID client fixture and validates it against the static client policy; no headed Memory App is included).
- [ ] 8.2 Prove Login with Vana from Memory App to account domain.
- [x] 8.3 Prove Memory App can request a mock account-hosted data action. `spikes/oidc-rp-fixture/action-config.mjs` defines the Memory App mock action request body, and `connect/src/lib/auth/memory-app-action-flow.test.ts` drives `handleCreateActionRequest` with the real static client policy and in-memory persistence.
- [x] 8.4 Prove Memory App receives only a mock result through action-code exchange. `memory-app-action-flow.test.ts` approves the request, extracts the redirect `action_code`, exchanges it through `handleExchangeActionCode`, and asserts the response is `result_mode: "mock"` with no action code, state, or `vana_user_id` leakage.
- [x] 8.5 Prove consent/action events are persisted. `memory-app-action-flow.test.ts` records and asserts the first-slice event sequence `action.requested`, `action.approved`, and `action.exchanged` across the in-memory proof; DB-backed event persistence remains covered by `account-actions.test.ts` when `DATABASE_URL` is available.
- [x] 8.6 Document what is not supported: offline reads, Personal Server enforcement, and builder-side decryption. See `openspec/changes/account-oidc-privy-actions/design-notes/memory-app-first-slice-limitations-2026-04-29.md`; it also calls out no real data source, no encrypted bundle/reference, no live DP RPC/L1 write, no continuous sync, no cross-device read, no BYO-wallet signing, and `execution_mode = "mock"` only.

## 9. Compatibility Guardrails

- [x] 9.1 Verify `/login` keeps current behavior until intentionally migrated. Narrow OIDC continuation added: `/login` now reads `?return_to=` (validated via `isSafeOidcReturnTo`), persists it via `oidc-continuation.ts` so it survives OAuth redirects, prefers it in `handleLoginComplete`, and clears it after use. DataConnect handoff path is unchanged when no safe OIDC `return_to` is present.
- [x] 9.2 Verify `/connect` keeps current DataConnect handoff behavior (`connect/src/app/(handoff)/connect/use-connect-page.test.ts`).
- [x] 9.3 Verify `/auth/device` and `/api/auth/device/*` keep CLI behavior (`connect/src/app/auth/device/page.test.tsx`, `connect/src/app/api/auth/device/device-routes.test.ts`).
- [x] 9.4 Verify `/api/sign` remains allowlisted and transitional (`connect/src/app/api/sign/sign-validation.test.ts`, `connect/src/app/api/sign/route.test.ts`).
- [x] 9.5 Add regression tests for existing handoff/login routes touched by OIDC work (`connect/src/app/(public)/login/use-login-page.test.ts` covers OIDC return_to redirect, external `return_to` rejection, persisted return_to recovery after OAuth callback, and pre-existing OAuth/email flows).

## 10. Validation

- [x] 10.1 Run `openspec validate account-oidc-privy-actions --type change --strict --json`.
- [x] 10.2 Run `cd connect && pnpm test` after implementation tasks.
- [x] 10.3 Run `cd connect && pnpm lint` after implementation tasks.
- [x] 10.4 Run `cd connect && pnpm build` before review (`NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` supplied with valid-looking local values).
- [x] 10.5 Run the standard OIDC relying-party fixture from clean local state and record the exact command/output in the PR. Scope: local Hydra v26 POC plus `openid-client@6.8.4`, not deployed production `account.vana.org` OIDC.
- [x] 10.6 Run regression tests for `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, and `/api/sign`.
- [x] 10.7 Verify no redirect URL contains raw action result data or user data (`connect/src/lib/auth/account-action.test.ts` verifies the action redirect parameter set).
- [x] 10.8 Verify the PR description lists remaining production gaps: issuer decision, first real-data source, first non-mock result implementation, live DP RPC integration, and production Memory App integration.
