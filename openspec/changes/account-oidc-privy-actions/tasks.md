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
- [ ] 2.8 Run one managed issuer POC or vendor confirmation for exact `sub = vana_user_id` and exact `https://account.vana.org` issuer support.
- [x] 2.9 Add production-code Hydra admin adapter seam and tests (`connect/src/lib/auth/hydra-admin.ts`) without wiring App Router login/consent routes yet.

## 3. OIDC Provider Surface

- [ ] 3.1 Implement `/.well-known/openid-configuration` through the chosen issuer shape.
- [ ] 3.2 Implement or configure `/.well-known/jwks.json`.
- [ ] 3.3 Implement `/oauth2/authorize` with Authorization Code + PKCE.
- [ ] 3.4 Implement `/oauth2/token` for authorization code exchange.
- [ ] 3.5 Implement `/oauth2/userinfo`.
- [ ] 3.6 Implement `/oauth2/revoke`.
- [ ] 3.7 Add issuer, client, redirect URI, state, nonce, and PKCE tests.
- [ ] 3.8 Add a NextAuth/Auth.js compatibility test or fixture.

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
- [ ] 5.3 Add redirect URI and origin allowlist checks (record fields `redirectUris` and `allowedOrigins` are modeled in `OauthClientRecord`; enforcement remains pending at the authorize/Hydra client-config boundary).
- [x] 5.4 Add client display metadata for consent/action screens (`displayName` field on `OauthClientRecord`).
- [x] 5.5 Add future field for linked protocol principal without requiring it in the first slice (`protocolPrincipal?: { kind, id }` on `OauthClientRecord`).

## 6. Privy Provider Boundary

- [x] 6.1 Define provider adapter interface for current Privy-native session resolution (`connect/src/lib/auth/login-session-adapter.ts`: `LoginSessionAdapter`, `LoginEvidence`, `createPrivyLoginSessionAdapter`).
- [x] 6.2 Resolve embedded wallet address from current Privy session and create linked wallet records (`pickEmbeddedEvmWallet` requires Privy-issued `wallet_client_type` / `wallet_client`; OIDC login route forwards evidence to `resolveVanaUserByPrivyEvidence`).
- [x] 6.3 Document the transitional nature of Privy-native login if used (file-level docstring on `login-session-adapter.ts` and adapter export comment).
- [ ] 6.4 Define target Privy custom JWT auth integration path.
- [ ] 6.5 Add tests that downstream OIDC tokens contain Vana account subject, not Privy subject.

## 7. Account-Hosted Action Requests

- [ ] 7.1 Add `account_action_requests` migration.
- [ ] 7.2 Add `account_action_results` migration.
- [ ] 7.3 Add `account_consent_events` migration.
- [ ] 7.4 Implement action request creation for registered clients.
- [ ] 7.5 Persist explicit action execution mode: first `mock`, later `embedded_wallet_account_hosted`, `byo_wallet_client_signed`, or future `delegated_runtime`.
- [ ] 7.6 Implement action page that requires login and displays client/action details.
- [ ] 7.7 Implement approve/deny handling.
- [ ] 7.8 Implement redirect back with `action_code` and `state`.
- [ ] 7.9 Implement action-code exchange with client binding and expiration.
- [ ] 7.10 Add tests proving no raw user data is sent through redirect parameters.
- [ ] 7.11 Add tests proving BYO-wallet action requests require client/user wallet signing rather than backend silent signing.
- [ ] 7.12 Add tests proving account-local consent/action events include the minimum DP RPC-compatible fields.
- [ ] 7.13 Add tests proving first non-mock result mode must be encrypted bundle plus short-lived reference unless explicitly overridden by config/design.

## 8. Memory App Spike

- [ ] 8.1 Implement a dev Memory App or Auth.js client fixture.
- [ ] 8.2 Prove Login with Vana from Memory App to account domain.
- [ ] 8.3 Prove Memory App can request a mock account-hosted data action.
- [ ] 8.4 Prove Memory App receives only a mock result through action-code exchange.
- [ ] 8.5 Prove consent/action events are persisted.
- [ ] 8.6 Document what is not supported: offline reads, Personal Server enforcement, and builder-side decryption.

## 9. Compatibility Guardrails

- [x] 9.1 Verify `/login` keeps current behavior until intentionally migrated. Narrow OIDC continuation added: `/login` now reads `?return_to=` (validated via `isSafeOidcReturnTo`), persists it via `oidc-continuation.ts` so it survives OAuth redirects, prefers it in `handleLoginComplete`, and clears it after use. DataConnect handoff path is unchanged when no safe OIDC `return_to` is present.
- [x] 9.2 Verify `/connect` keeps current DataConnect handoff behavior (`connect/src/app/(handoff)/connect/use-connect-page.test.ts`).
- [x] 9.3 Verify `/auth/device` and `/api/auth/device/*` keep CLI behavior (`connect/src/app/auth/device/page.test.tsx`, `connect/src/app/api/auth/device/device-routes.test.ts`).
- [x] 9.4 Verify `/api/sign` remains allowlisted and transitional (`connect/src/app/api/sign/sign-validation.test.ts`, `connect/src/app/api/sign/route.test.ts`).
- [x] 9.5 Add regression tests for existing handoff/login routes touched by OIDC work (`connect/src/app/(public)/login/use-login-page.test.ts` covers OIDC return_to redirect, external `return_to` rejection, persisted return_to recovery after OAuth callback, and pre-existing OAuth/email flows).

## 10. Validation

- [ ] 10.1 Run `openspec validate account-oidc-privy-actions --type change --strict --json`.
- [ ] 10.2 Run `cd connect && pnpm test` after implementation tasks.
- [ ] 10.3 Run `cd connect && pnpm lint` after implementation tasks.
- [ ] 10.4 Run `cd connect && pnpm build` before review.
- [ ] 10.5 Run the standard OIDC relying-party fixture from a clean user and record the exact command/output in the PR.
- [x] 10.6 Run regression tests for `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, and `/api/sign`.
- [ ] 10.7 Verify no redirect URL contains raw action result data or user data.
- [ ] 10.8 Verify the PR description lists remaining production gaps: issuer decision, first real-data source, first non-mock result implementation, live DP RPC integration, and production Memory App integration.
