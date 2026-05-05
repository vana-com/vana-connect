# Vana Auth & Custody Redesign — Execution Plan (revised)

Status: planning, post-critique-2
Owner: Tim
Author: claude (under Tim's direction)
Last updated: 2026-05-04

## Revision history

- **v1** initial plan based on agreed-upon architecture (auth+signing layers, provider containment).
- **v2** folded in four adversarial critiques: architecture (3 blockers, 6 serious), security (4 critical, 6 high), Hydra capabilities (3 corrections), simplicity (multiple cuts).
- **v3 (this)** folds in three round-2 critiques. No new architectural blockers; all deltas are concrete spec items (DDL details, KEK source, tombstone storage backing, branded-type creation, confirmation lifecycle for non-browser callers, PS-side introspection trust path, atomic-vs-dual-auth commitment, PR-group merges, CSRF→Bearer-only on mutating routes, Privy-nonce defer/harden).

## Context

We are refactoring `vana-connect/connect` (account.vana.org) and the surrounding ecosystem (Personal Server, Memory App, data-connect) to enforce **provider containment** at the auth layer and introduce a Vana-native **signing authority** layer.

Two non-negotiable architectural invariants:

1. **Provider Containment Invariant (PCI):** Wallet provider identifiers (Privy DID, Para user id, etc.) appear only at login/linking and provider-adapter boundaries. They never appear in business identifiers, OIDC subjects, grant payloads, app permissions, or per-request paths. The only canonical user identifier is `vana_user_id`.

2. **Signing Authority Invariant (SAI):** Server-side signing on a user's behalf requires an explicit, scoped, payload-bound, single-use `signing_authorization` row issued **at the call site** that needs it. Wallets controlled by users (external EOAs) cannot be server-signed; they require an interactive `signature_challenge` flow.

Both are enforced by branded TypeScript types, runtime predicates, and dev/staging tripwires.

### Critical clarifications

- **Hydra access tokens are opaque, not JWTs.** Verifier uses cached introspection (~10ms) for real revocation. JWT mode would buy stateless verification at the cost of revocation; the latency budget is acceptable here.
- **Authorities are NEVER auto-issued.** Issuance is at-call-site only, just-in-time, single-use, payload-bound. Auto-issuance turns SAI into "session blanket grant" which equals today's master-key model.
- **Hydra has native RFC 8628 device flow.** No custom `/oauth/device/*` routes; reuse Hydra's `/oauth2/device/auth` with a thin verification UI page.
- **Logout is fail-closed.** Tombstone-first ordering: write DB-backed tombstone → clear cookie → revoke refresh at Hydra (best-effort) → end-session at Hydra (best-effort). Steps 3-4 retried via background job. Failure of Hydra calls leaves DB tombstone intact; verifier rejects.
- **State-mutating routes are Bearer-only.** Browsers fetch the access token from a non-HttpOnly companion cookie (`vana_session_access`, JS-readable) and send `Authorization: Bearer`. Cookie alone authenticates only safe (GET/HEAD) requests for SSR/navigation. Drops the entire CSRF double-submit plane (no `vana_csrf` cookie, no `x-vana-csrf` header). Origin allowlist + `SameSite=Lax` on the cookie remain as defense-in-depth.
- **Tombstone is DB-backed**, not in-process. New table `vana_session_tombstones(hydra_session_id PK, vana_user_id, created_at, expires_at)`. Verifier checks tombstone on every introspection cache hit. Multi-lambda safe.
- **Introspection cache is best-effort.** Per-lambda 30s TTL. Documented as not security-critical; high-risk routes gate via `interactive_confirmations`, not via introspection freshness.
- **`interactive_confirmations` keys on `(vana_user_id, payload_hash)`**, not on `(vana_user_id, purpose)`. The user-clicked summary is bound verbatim to the same payload that produces `payload_hash`. Two TTLs: confirmation row TTL = 5 min (read-the-summary friendly); resulting `signing_authorization` TTL = 60 s (single use, fast expiry). Idempotent on retry within a 30 s grace window after consumption.
- **Confirmation lifecycle for non-browser callers (Tauri).** Inline modal preferred over redirect. For Tauri the route returns `{ confirmation_id, confirmation_url, status_url }`; Tauri shell-opens `confirmation_url`, polls `status_url` (`pending|confirmed|expired`); on `confirmed` retries the original call with `x-vana-confirmation-id`.

## Goal

When this work lands:

- Hydra issues opaque Vana session tokens (access + refresh) with `sub = vana_user_id`.
- Every authenticated route in `account.vana.org` reads its session via a single `getVanaSession(req)` verifier that uses cached Hydra introspection.
- State-mutating routes accept Bearer only (or cookie + CSRF token).
- Every server-side signing operation flows through `wallet.signTypedData(...)` with a closed `purpose` enum and a freshly-issued, single-use, payload-bound `signing_authorization`.
- High-risk purposes (`create_grant`, `register_personal_server`) require interactive user confirmation before authority issuance.
- User-controlled EOAs return `not_supported_yet` from the wallet API; `signature_challenges` table is deferred until the first interactive flow lands.
- `data-connect` supports both local-bundled and remote Personal Servers, configurable via Settings, and authenticates to remote PS using Vana session tokens minted via Hydra's native device-code flow.
- Memory App fetches real ChatGPT memories from the user's remote PS using a real grant, end-to-end.
- A complete runbook is in place so the user (Tim) can validate the flow with two manual steps: Privy login and ChatGPT Playwright login.

## Out of scope (explicit)

- Para or Dynamic adapter implementation. Designed for; not built.
- Smart-account / EIP-7702 / session keys on-chain. `key_control_type` enum extensible but no implementation.
- Production deployment. Everything ships to dev.
- Existing user data migration. Greenfield (Tim is the only user); we wipe and recreate where needed.
- `signature_challenges` and `wallet_attestations` tables — deferred until needed (no current EOA flow).
- KMS migration of `PRIVY_SIGNER_PRIVATE_KEY`. Documented as a known security debt (`security-debt.md`); addressed separately.
- CI grep enforcement. Replaced by branded types + dev tripwire.
- Privy-bridge nonce mechanism. v3 defers; defenses are `aud === PRIVY_APP_ID` (asserted in code + unit test that rejects foreign-app tokens) + `iat` skew ≤5 min + rate limiting. Single-user system; nonce becomes a follow-up when there is more than one user. Documented in `security-debt.md`.

## Stages

| #   | Stage                                                                                    | Type         | Depends on    |
| --- | ---------------------------------------------------------------------------------------- | ------------ | ------------- |
| 0   | Discovery + critique-driven revision                                                     | done         | —             |
| 1   | Architecture design doc                                                                  | doc          | 0             |
| 2   | Schema additions/changes                                                                 | code         | 1             |
| 3   | Vana session-token plane (Hydra config + verifier)                                       | code         | 1, 2          |
| 4   | Atomic per-flow cutover (3 PRs: session-route-swap, servers-atomic, device-decommission) | code         | 3, 5          |
| 5   | Signing authority plane (no challenges yet)                                              | code         | 1, 2, 3       |
| 6   | Provider Containment branded types + dev tripwire                                        | code         | 3             |
| 7   | data-connect remote PS + Hydra device-code login                                         | code         | 3, 5          |
| 8   | Memory App regression check                                                              | manual       | 4, 5          |
| 9   | End-to-end validation + runbook                                                          | doc + manual | 4, 5, 6, 7, 8 |

**Key revision from v1:** Stage 4 (route auth swap) and Stage 6/v1 (signing call site swap) are now merged into Stage 4, executed **per-flow atomically** so `register-on-chain` and similar routes never end up in a state where the route input contract no longer matches what the internal calls require.

## Stage 0 — Discovery + critique-driven revision (DONE)

- 3 audits complete (routes, signing, schema)
- 4 critiques folded in (architecture, security, Hydra, simplicity)
- This document is the v2 plan

## Stage 1 — Architecture design doc

**Output:** `01-architecture.md` containing:

1.1 The two invariants (PCI, SAI) stated formally with branded type signatures.

1.2 Schema DDL for new and changed tables. The architecture doc must include exact CREATE TABLE statements with column types, NOT NULL, indexes, and constraints. In particular:

- `signing_authorizations(id PK, vana_user_id, vana_wallet_id, purpose, payload_hash NOT NULL, max_uses NOT NULL DEFAULT 1, used_count NOT NULL DEFAULT 0, expires_at NOT NULL DEFAULT now()+60s, created_at, consumed_at, confirmation_event_id NULL FK→interactive_confirmations, hydra_session_id NOT NULL)`. Partial UNIQUE index `(payload_hash) WHERE used_count = 0` to prevent two unconsumed authorities for the same payload. Atomic decrement via `UPDATE … SET used_count = used_count + 1 WHERE id = $1 AND used_count < max_uses RETURNING *` inside the same transaction as the Privy SDK call.
- `interactive_confirmations(id PK ≥128b crypto-random, vana_user_id, vana_wallet_id, purpose, payload_hash NOT NULL, payload_summary jsonb NOT NULL, expires_at NOT NULL DEFAULT now()+5min, consumed_at, hydra_session_id NOT NULL)`. The `payload_summary` is the verbatim JSON the user saw at confirm time; route handler renders the summary from the same serialized payload that produces `payload_hash`. Property test asserts every field in the typed_data appears in `payload_summary` or the route fails closed.
- `vana_session_tombstones(hydra_session_id PK, vana_user_id, created_at, expires_at NOT NULL DEFAULT now()+15min)`. DB-backed, multi-lambda safe. Verifier checks tombstone on every introspection cache hit.
- `vana_refresh_tokens(id PK, vana_user_id, hydra_session_id, ciphertext bytea NOT NULL, iv bytea NOT NULL, kek_version int NOT NULL, created_at, rotated_at, family_id)`. KEK source: dedicated env var `VANA_REFRESH_TOKEN_KEK` distinct from `PRIVY_SIGNER_PRIVATE_KEY`. Algorithm: AES-256-GCM with per-row IV. Refresh-token rotation on each use; reuse detection by `family_id`; reuse → revoke entire family.
- Add `key_control_type` enum + column to `vana_linked_wallets` ('provider_embedded' | 'user_controlled_eoa' | 'smart_account' for future). Default `'provider_embedded'`.
- Add `owner_vana_user_id` text to `oauth_clients` (nullable during cutover, alongside existing `owner_address`). Backfill in stage 4G; drop `owner_address` in follow-up cleanup PR with hard date in plan.
- Migrate `personal_servers.user_id` semantics: column stays, value flips from lowercase wallet address to `vana_user_id`. Greenfield wipe of dev DB rows.
- **NOT** creating: `auth_provider_links` (rename of existing `vana_provider_links`; pure churn), `wallet_attestations`, `signature_challenges`, `embedded_wallet_custody`.

1.3 The closed `purpose` enum, populated from observed sites:

- `register_personal_server`
- `register_personal_server_deregistration`
- `register_builder` (server-EOA, separate identity, not a user-custody operation; documented exception)
- `create_grant`
- `revoke_grant`

1.4 `getVanaSession(req)` API spec:

- Accepts cookie OR Bearer for safe methods (GET/HEAD).
- For state-mutating methods (POST/PUT/PATCH/DELETE): **Bearer required.** Cookie alone is rejected. Browsers read the access token from a JS-readable companion cookie `vana_session_access` and send it as `Authorization: Bearer`. The HttpOnly `vana_session` cookie (used for SSR/navigation) does not authenticate state-mutating requests.
- Defense-in-depth on cookie path: enforce `Origin` header in allowlist `{account.vana.org, *.vana.org}`; `SameSite=Lax`; `Secure`.
- Calls Hydra `/admin/oauth2/introspect` with token; verifier reads `active`, `sub`, `aud`, `exp`, `client_id`, `ext`.
- Caches `(token_hash → introspection_result)` with 30s TTL per-lambda. **Tombstone check is DB-backed**: even cache hits validate against `vana_session_tombstones` before returning.
- Returns `{ vanaUserId: VanaUserId, sessionId: HydraSessionId, scope: string[], audience: string[] } | null`.
- Pins `iss`, validates `aud` includes `account.vana.org`, validates `exp`, validates `sub` matches `isVanaUserId`.
- Implemented via `jose` library (or equivalent) with explicit alg pinning even though tokens are opaque — for any signed JWT artifacts (e.g., id_tokens received during Privy bridge).

1.5 `wallet.signTypedData(...)` API spec:

- Input: `{ vanaUserId, vanaWalletId?, purpose, typedData, confirmationEventId? }`
- Server-EOA path (provider_embedded): writes `signing_authorization` row (max_uses=1, payload_hash bound, expires in 60s) atomically with the Privy SDK call, returns `{ kind: "signature", signature, authorizationId }`
- User-EOA path: returns `{ kind: "not_supported_yet" }` for now (signature_challenges deferred)
- High-risk purposes: requires `confirmationEventId` (a row in `interactive_confirmations` proving the user clicked through a UI prompt within the last 60s); without it, route returns 401 with `confirmation_required`

1.6 The interactive confirmation protocol (NOT the deferred user-EOA challenge protocol):

- Route detects high-risk purpose; checks for valid `confirmation_event_id`.
- If absent, route writes a **pending** `interactive_confirmations` row (server-generated id, ≥128b crypto-random, payload_hash bound, 5min TTL) and returns 401 `{ error: "confirmation_required", confirmation_id, confirmation_url, status_url, purpose, payload_summary }`.
- **Browser path**: client renders inline modal (preferred) showing `payload_summary`. On Confirm, client POSTs to `confirmation_url` (`/api/auth/confirmations/:id/confirm`) which sets `consumed_at` atomically. Client retries the original route with `x-vana-confirmation-id` header.
- **Tauri / non-browser path**: client `shell-open`s `confirmation_url` (full https URL) in user's browser. User authenticates (Vana session) and clicks Confirm. Tauri polls `status_url` (`/api/auth/confirmations/:id/status`) every 2s until `confirmed|expired`. On `confirmed`, retries the original call with `x-vana-confirmation-id`.
- **Idempotency**: route handler that consumes the confirmation does so atomically with the signing op inside one DB transaction. Replay of the same `confirmation_id` within 30s returns the cached prior result (200 with original response body), not a fresh signing operation. After 30s grace, replay returns 410 `consumed`.
- **Keying**: rows keyed on `(vana_user_id, payload_hash, purpose)` — two routes simultaneously needing confirmation for different payloads each get their own row; UI renders separate confirmations.
- **TTLs (decoupled)**: confirmation row TTL = 5min (read-the-summary friendly). Resulting `signing_authorization` TTL = 60s, `max_uses=1`.
- This is a generic mechanism, used by `create_grant` and `register_personal_server`.

1.7 Hydra session token format and lifecycle:

- Access token: opaque `ory_at_*`, 15min TTL.
- Refresh token: opaque `ory_rt_*`, 30 day TTL, rotated on each refresh, reuse-detected (entire family revoked on reuse).
- `sub = vana_user_id`. `aud` includes `account.vana.org` for normal sessions; for data-connect device-flow sessions, `aud` additionally includes the user's PS URL pattern (`https://*.myvana.app` or specific PS URL — see 1.8) so PS will accept the same token.
- Refresh token stored encrypted-at-rest in `vana_refresh_tokens` (AES-256-GCM, KEK = `VANA_REFRESH_TOKEN_KEK` env var, distinct from `PRIVY_SIGNER_PRIVATE_KEY`, per-row IV, `kek_version` for rotation).
- **Logout (fail-closed, ordered)**:
  1.  Write `vana_session_tombstones` row (DB) — synchronous, must succeed.
  2.  Clear `vana_session` and `vana_session_access` cookies.
  3.  Revoke refresh token at Hydra (`/oauth2/revoke`) — best-effort; failures retried by background job.
  4.  End SSO session at Hydra (`/oauth2/sessions/logout`) — best-effort.
      If step 1 fails, return 500; client retries. If step 1 succeeds but 3-4 fail, verifier still rejects (tombstone is the source of truth).

1.8 Hydra device-code flow integration (no custom routes):

- Register a Hydra OAuth client `data-connect` with `grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token']`, `audience: ['account.vana.org', 'https://*.myvana.app']` (multi-audience so PS accepts same token), `token_endpoint_auth_method: 'none'` (public client per RFC 8628).
- data-connect calls Hydra's native `/oauth2/device/auth` directly.
- account.vana.org renders a verification UI page at `/auth/device` that calls Hydra admin's `getDeviceUserCodeRequest` + `acceptUserCodeRequest` after the user is already logged in via Privy and reviews + confirms the requesting client name + scopes (anti-phishing).
- Polling: enforce RFC 8628 `interval` (default 5s); respond `slow_down` if violated. user_code: ≥6 chars, uppercase letters minus ambiguous (`O`, `0`, `I`, `1`). Code lifetime: 10 min, single-use, expire on success or denial.

1.9 Provider Containment enforcement (no CI grep):

- **Create the branded type.** The current `isVanaUserId` is a runtime regex; the existing `assertVanaUserId` is a guard but the type signature is still `string`. Stage 6 introduces:
  ```ts
  export type VanaUserId = string & { readonly __brand: "VanaUserId" };
  export function assertVanaUserId(v: string): asserts v is VanaUserId {
    /* runtime check */
  }
  ```
  Then audit every call site that takes `string` for a `vanaUserId` parameter and tighten to `VanaUserId`. The compiler then enforces "no plain string masquerading as a vanaUserId."
- Runtime tripwire middleware in dev/staging: scans response bodies for `did:privy:` substring; fails request loudly with stack trace identifying the route. Disabled in production.
- Code review enforces import boundary: `@privy-io/*` SDKs imported only from `src/lib/auth/wallet-providers/privy.ts` and `src/app/api/auth/session/route.ts` (the Privy bridge).

1.10 Per-flow migration table — **3 atomic PRs**, not 8 (round-2 simplicity merge):

| PR                             | Flow group                                                              | Routes touched                                                                                                                                      | Signing call sites                                                                                                                                                                                                                                                                                                                                    | Notes                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR-1 "session-route-swap"**  | Login + Account access + Actions + Admin oauth-clients (A+B+C+G merged) | `/api/auth/session`, `/auth/oidc/login`, `/auth/oidc/consent`, `/api/account/access*` (8), `/api/account/actions*` (5), `/api/admin/oauth-clients*` | none — these are read-only or non-signing routes                                                                                                                                                                                                                                                                                                      | All do the same thing: replace bespoke auth with `getVanaSession`. Splitting was review theater. **PR-1 ships Bearer-only on mutating routes.** Admin oauth-clients ships **atomic Bearer-only**, not dual-auth — no transition window.                        |
| **PR-2 "servers-atomic"**      | Servers GET/DELETE + register-on-chain (D+E merged)                     | `/api/servers`, `/api/servers/[id]`, `/api/servers/[id]/register-on-chain`                                                                          | `register-on-chain.ts`: swap from `fetch('/api/sign', {body: masterKeySignature})` to `wallet.signTypedData({purpose: 'register_personal_server', confirmationEventId, ...})`. Client `useServer` hook stops computing `masterKeySignature`; handles `401 confirmation_required` by opening confirm modal and retrying with `x-vana-confirmation-id`. | Single PR because: (a) `personal_servers.user_id` semantics flip (wallet → vana_user_id) is load-bearing for E, (b) `register-on-chain.ts` route input contract no longer takes masterKeySignature so client + route + signing call site must change together. |
| **PR-3 "device-decommission"** | Delete legacy device flow, add Hydra-fronted UI (H)                     | Delete `/api/auth/device/*`, add `/auth/device` UI page calling Hydra admin                                                                         | none                                                                                                                                                                                                                                                                                                                                                  | Independent of PR-1/PR-2.                                                                                                                                                                                                                                      |

Stage 4F (Grants) is a confirm-only check that grant flow still works after PR-1; folded into stage 8.

1.11 PS-side trust path for Vana session tokens (resolves round-2 B.5):

- **PS calls account.vana.org `/api/oauth/introspect`**, NOT Hydra admin directly. PS never gets GCP creds for Hydra admin. account.vana.org introspects against Hydra and returns the result. PS's trust dependency on account.vana.org is unchanged from today.
- Token `aud` must include the PS's URL pattern (set in stage 1.8). PS rejects tokens whose audience does not include itself.
- PS reads `vana_user_id` from introspection result; resolves to wallet address via account.vana.org `GET /api/account/wallets/:vanaUserId` (cached). Alternatively, the introspection response includes `ext.linked_wallets` so PS doesn't need a second call.
- Stage 7.6 adds this fifth auth mechanism (`vana-session`) to PS's `web3-auth.ts` middleware alongside the existing four.

1.12 Open questions, all resolved by Tim before stage 2 begins:

- Confirm "opaque + introspection" choice (vs JWT). v3 says yes; verify.
- Confirm 15min access / 30day refresh TTLs. v3 says yes; verify.
- Confirm inline modal for browser confirmation, shell-open + poll for Tauri. v3 says yes; verify.
- Confirm Privy nonce defer to follow-up. v3 says yes; verify.
- Confirm CSRF plane dropped in favor of Bearer-only on mutating routes.
- Confirm PS introspects via account.vana.org (not Hydra admin direct).

**Acceptance:** Tim reads the doc, signs off (or pushes back, iterate). No code moves until signed off.

## Stage 2 — Schema additions/changes

**Output:** Single PR to vana-connect with:

2.1 Migration `008_signing_auth_plane.sql`:

- Add `key_control_type` enum + column to `vana_linked_wallets`. Default `'provider_embedded'` for existing rows (Tim's row).
- Create `signing_authorizations` table.
- Create `interactive_confirmations` table.
- Create `vana_refresh_tokens` table (encrypted refresh tokens).
- Add `owner_vana_user_id text` to `oauth_clients` (nullable, sits alongside `owner_address` during cutover).

2.2 Repository functions for each new table in `src/lib/db/auth-signing.ts` and `src/lib/db/sessions.ts`.

2.3 Tests for repository functions.

2.4 Documentation comment in each migration explaining the SAI.

**Acceptance:** PR merges to develop. CI green. Migrations run on dev DB.

## Stage 3 — Vana session-token plane

**Output:** PR with:

3.1 `src/lib/auth/vana-session.ts` — `getVanaSession(req)` verifier with cached introspection.

3.2 Hydra config update via admin API call (in a one-shot script committed to the repo):

- Update `data-connect` OAuth client to enable refresh + device-code grants
- Confirm access TTL = 15min, refresh TTL = 30day
- Confirm `audience: ['account.vana.org']` set on relevant clients

3.3 Login flow rewrite for `/api/auth/session`:

- Input: Privy id_token in body
- Output: 200 `{ access_token, refresh_token, expires_in }` and Set-Cookie for browser callers
- Steps: verify id_token (Privy SDK), check `aud === PRIVY_APP_ID`, check `iat` within 5min, resolve to `vana_user_id`, synthesize a Hydra login challenge by calling Hydra's authorize endpoint with prompt=none, accept-login server-side with `subject = vanaUserId`, exchange code at token endpoint, write refresh token to `vana_refresh_tokens` (encrypted), return tokens
- Reject if `iat` skew > 5min, audience mismatch, or replay (no nonce yet — added in 3.10)

3.4 Hydra device-flow verification UI at `/auth/device`:

- User enters/scans user_code
- account.vana.org calls Hydra admin `getDeviceUserCodeRequest` + `acceptUserCodeRequest`
- On success, redirects to a confirmation page

3.5 `.well-known/oauth-authorization-server` metadata document (mostly a proxy of Hydra's).

3.6 Logout endpoint `/api/auth/logout`:

- Revokes refresh token at Hydra
- Calls Hydra `/oauth2/sessions/logout` to end SSO session
- Adds session_id to a 15min tombstone (in `getVanaSession` introspection cache, marks session inactive)
- Clears `vana_session` cookie

3.7 CSRF token plane: `getVanaCsrfToken(req)`, `setVanaCsrfCookie(res)`. Double-submit pattern: on login, set both `vana_session` (HttpOnly) and `vana_csrf` (readable by JS); state-mutating routes require header `x-vana-csrf` matching cookie value.

3.8 Tests for: cookie path, Bearer path, expired token, refresh, revocation lag (introspection cache invalidation), CSRF rejection.

3.9 Verifier configured with `jose` library, explicit `algorithms`, `issuer`, `audience`, `clockTolerance: 60`, JWKS cache TTL.

3.10 Privy bridge nonce mechanism: client first calls `/api/auth/session/begin` → server returns 16-byte nonce stored in 5min TTL row; Privy login passes `nonce` to embedded wallet; client submits id_token containing nonce; server validates it matches stored nonce.

**Acceptance:** `getVanaSession()` callable from any route. Login still works for Tim. Logout actually revokes. PR merged.

## Stage 4 — Atomic per-flow cutover (A–H)

Each flow group is one PR:

**4A. Login & session.** Already partially in stage 3.3. Plus: `/auth/oidc/login` already uses `vanaUserId` as subject — just confirm; `/auth/oidc/consent` same.

**4B. Account access (8 routes).** Migrate from `ACCOUNT_LOGIN_SESSION_COOKIE` to `getVanaSession`. Drop bespoke session adapter. Cookie semantics shift to `vana_session`; cookie name changes; client-side fetches updated.

**4C. Action requests (5 routes).** Drop the inline `verifyPrivyIdentityToken` call in `account-actions-runtime.ts:65`. Use `getVanaSession`. The action-decision route invokes `executeGrantViaPersonalServer` server-side; PS auth is unchanged (already OAuth2 client_credentials). No custody migration needed for this flow — PS holds its own keys.

**4D. Servers GET/DELETE.** Migrate auth from `master-key-signature` to `getVanaSession`. The DB column `personal_servers.user_id` semantics change from "lowercased EVM address" to "vana_user_id". Migration script in stage 2 handles this.

**4E. Servers register-on-chain (atomic group).** Two coupled changes that ship together:

- Route auth swap to `getVanaSession`
- `register-on-chain.ts` internal call swap from `fetch('/api/sign', {body: masterKeySignature})` to `wallet.signTypedData({purpose: 'register_personal_server', vanaUserId, typedData, confirmationEventId})`
- Adds the `interactive_confirmations` flow: client calls `/api/servers/[id]/register-on-chain` → 401 confirmation_required → renders `/confirm/register_personal_server` page → user clicks Confirm → retry with `x-vana-confirmation-id`
- Drop master-key-signature recovery from this route entirely
- Client-side `useServer` hook stops computing masterKeySignature; uses `vana_session` cookie

**4F. Grants (create).** Already standalone via PS OAuth2 client_credentials. Just confirm it still works after 4E.

**4G. Admin oauth-clients.** Migrate auth from master-key-signature to `getVanaSession`. Routes accept either masterKeySignature OR Bearer during this PR for one transition deploy; subsequent PR drops master-key path. After this lands: `oauth_clients.owner_vana_user_id` is populated; admin UI works only via Vana session. Drop `oauth_clients.owner_address` in a follow-up cleanup PR.

**4H. Device flow decommission.** Delete `/api/auth/device/*` legacy routes (no longer needed; Hydra's native device flow is in stage 3). Add Hydra-fronted `/auth/device` UI.

**Acceptance per group:** Routes accept Vana sessions. All existing functionality works locally end-to-end. Tests pass.

## Stage 5 — Signing authority plane

**Output:** PR with (already partially in 4E above; this PR is the underlying infrastructure):

5.1 `src/lib/auth/signing-purposes.ts` — closed enum + per-purpose validators that hash and constrain typed-data shape.

5.2 `src/lib/auth/wallet.ts` — `wallet.signTypedData(...)`:

- Looks up `vana_linked_wallets[vanaUserId, vanaWalletId or primary]`
- If `key_control_type === 'provider_embedded'`: validates purpose, validates typedData shape, checks confirmation if required, writes `signing_authorization` (max_uses=1, payload_hash bound, expires 60s), calls `Privy.signTypedData(...)`, returns `{ kind: 'signature', ... }`
- If `key_control_type === 'user_controlled_eoa'`: returns `{ kind: 'not_supported_yet' }` (future PR adds challenge flow)
- On every call: increments authority `used_count` atomically; rejects if `used_count >= max_uses`

5.3 `src/lib/auth/wallet-providers/privy.ts` — Privy adapter, **only place in the codebase that imports `@privy-io/node`** beyond the Privy bridge route (`/api/auth/session`).

5.4 `src/lib/auth/interactive-confirmations.ts` — `requestConfirmation`, `consumeConfirmation`. The page at `/confirm/<purpose>` is the UI half.

5.5 No auto-issued authorities. Period.

5.6 The legacy `/api/sign` route is **deleted** in this PR (no callers after 4E; admin/device flows are already on Vana session).

5.7 Tests: per-purpose validation, payload-hash binding, replay rejection, confirmation requirement.

**Acceptance:** No `privyClient.wallets()` calls outside `wallet-providers/privy.ts`. All existing flows still work end-to-end.

## Stage 6 — Provider Containment branded types + dev tripwire

**Output:** PR with:

6.1 `VanaUserId` branded type used everywhere `vana_user_id` is passed. The branded constructor is `assertVanaUserId(...)` (already exists; just expand usage).

6.2 Dev/staging response-body tripwire middleware that scans for `did:privy:` and fails loudly. Disabled in production.

6.3 Code review checklist documented in `docs/auth-redesign/02-code-review-checklist.md`.

**Acceptance:** PR merged. Dev tripwire active.

## Stage 7 — data-connect remote PS + Hydra device-code login

**Output:** PR to data-connect with:

7.1 `AppConfig.serverMode: 'local' | 'remote'`, `remoteServerUrl: string` (already partially scaffolded per audit).

7.2 `usePersonalServer` skips local startup when `serverMode === 'remote'`.

7.3 `personalServerIngest.ts` accepts a base URL and a Bearer token; signs no Web3Signed (the new model is "PS accepts Vana session as Bearer" — see 7.6 for the PS-side change).

7.4 Settings UI: "Server Mode" radio + remote URL input + "Connect with Vana" button.

7.5 Login with Vana for data-connect (Hydra device-code flow, native):

- Click "Connect with Vana" → Tauri calls Hydra's `/oauth2/device/auth` directly with `client_id=data-connect`, `scope=openid offline`
- Receives `device_code`, `user_code`, `verification_uri_complete`
- Opens browser to verification URI (Tauri can shell-open)
- Polls Hydra's `/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`
- On success: receives access + refresh tokens; stores in Tauri secure storage (Keychain/Credential Manager via plugin)
- Calls `account.vana.org/api/servers` (Bearer access token) → discovers user's PS URL → auto-populates `remoteServerUrl`

7.6 Update PS `web3-auth.ts` middleware to **also** accept Vana session tokens (introspect against Hydra). PS gains a new auth path "vana-session" that's owner-equivalent. This is what the simplicity critic was missing — without it, data-connect can't authenticate to PS as Bearer.

7.7 Update PS `data.ts` route construction to include `accessToken` in `web3Auth` deps (the missing wiring identified earlier). Until 7.6 lands, this stays as the bandage.

**Acceptance:** data-connect can be configured with remote PS via Settings or Login with Vana. Ingest succeeds.

## Stage 8 — Memory App regression check

8.1 Verify `vana-connect-mobile-dev.vercel.app/demo/login-with-vana` flow still works after 4C lands. The action-exchange route is migrating; the Memory App still posts the same body shape; result_payload still includes `grant_id` and `personal_server`.

8.2 Re-mint a grant; fetch real ChatGPT memories. Verify.

**Acceptance:** Memory App demo unaffected.

## Stage 9 — End-to-end validation + runbook

9.1 `10-runbook.md` — exact instructions for Tim to validate.

9.2 Pre-flight checks before declaring done:

- All flows in stage 4 table validated
- Tripwire running in dev
- data-connect Login with Vana works against Tim's deployed PS
- Memory App demo still works
- No `privyClient.users().get()` calls outside the bridge route
- No `privyClient.wallets()` calls outside the Privy adapter

9.3 The two human steps clearly documented.

**Acceptance:** Tim runs the runbook and sees real ChatGPT memories in Memory App, fetched from his real PS, with auth flowing through Vana session tokens.

## Sub-agent allocation

Where parallelism saves wall time (will use sub-agents):

- **Stage 1**: I write `01-architecture.md` myself (load-bearing).
- **Stage 2**: agent writes migration SQL + types + tests; I review.
- **Stage 3**: I write the verifier; agent writes the `/api/auth/session` rewrite; agent writes the device verification UI page.
- **Stage 4**: I split A–H across 4 agents max (B, C, D parallel; A first; E last; F/G/H after).
- **Stage 5**: I write the wallet API + adapter; agent writes the interactive_confirmations page.
- **Stage 6**: agent makes the type-branding sweep; I write the tripwire.
- **Stage 7**: I write the ingest signing + auth path; agent writes the Settings UI; agent writes the PS-side `web3-auth` Vana-session path.
- **Stage 8/9**: I do this manually.

## Risk register

| Risk                                                 | Mitigation                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hydra introspection cache stale on revocation        | 30s cache TTL is short enough; logout writes session_id to deny-list checked before cache hit                              |
| Per-request introspection adds latency               | Cached; ~10ms uncached, <1ms cached. Document budget.                                                                      |
| `interactive_confirmations` UX adds friction         | Only required for high-risk purposes (`create_grant`, `register_personal_server`); reviewed by Tim before stage 1 sign-off |
| Hydra device flow client config wrong                | One-shot setup script in stage 3.2; visible in `hydra-admin.ts` tests                                                      |
| PS doesn't accept Vana session yet                   | Stage 7.6 updates PS auth middleware before data-connect needs it                                                          |
| Refresh-token reuse detection requires session table | Built in stage 2                                                                                                           |
| Privy bridge nonce mechanism non-obvious             | Spec'd in 1.11 / 3.10 with sequence diagram                                                                                |
| `PRIVY_SIGNER_PRIVATE_KEY` leak still catastrophic   | Out of scope for this work; documented as known security debt (`docs/auth-redesign/security-debt.md`)                      |

## Definition of done

- [ ] All authenticated routes use `getVanaSession`; no `master-key-signature` recovery anywhere.
- [ ] Server-side signing flows through `wallet.signTypedData` with explicit purpose + payload-bound, single-use authority.
- [ ] High-risk purposes require `interactive_confirmations`.
- [ ] No `privyClient` calls outside `wallet-providers/privy.ts` and `/api/auth/session`.
- [ ] Dev tripwire passes (no `did:privy:` in response bodies).
- [ ] data-connect can configure a remote PS and authenticate via Hydra device-code Login with Vana.
- [ ] Memory App fetches real ChatGPT memories end-to-end.
- [ ] Runbook exists; Tim can validate end-to-end with two manual steps (Privy login, ChatGPT login).

## Next action

Begin Stage 1: write `01-architecture.md`.
