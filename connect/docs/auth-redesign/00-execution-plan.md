# Vana Auth & Custody Redesign — Execution Plan (v3)

Status: planning, post-critique-2
Owner: Tim
Author: claude (under Tim's direction)
Last updated: 2026-05-04

This supersedes `00-execution-plan.md` (v2). Round-2 critiques folded.

## Revision history

- **v1** initial plan: auth+signing layers, provider containment.
- **v2** folded round-1 critiques: architecture (3 blockers), security (4 critical/6 high), Hydra (3 corrections), simplicity (cuts).
- **v3 (this)** folds round-2 critiques. Round-1 blockers verified resolved. Spec gaps closed. Stage 4 cut from 8 PRs to 3.

## Context

Refactor `vana-connect/connect` (account.vana.org) and the surrounding ecosystem (Personal Server, Memory App, data-connect) to enforce **provider containment** at the auth layer and introduce a Vana-native **signing authority** layer.

Two non-negotiable architectural invariants:

1. **Provider Containment Invariant (PCI):** Wallet provider identifiers (Privy DID, Para user id, etc.) appear only at login/linking and provider-adapter boundaries. They never appear in business identifiers, OIDC subjects, grant payloads, app permissions, or per-request paths. The only canonical user identifier is `vana_user_id` (a branded TypeScript type, not just `string`).

2. **Signing Authority Invariant (SAI):** Server-side signing on a user's behalf requires an explicit, single-use, payload-bound `signing_authorization` row issued **at the call site** that needs it. High-risk purposes additionally require an `interactive_confirmation` event proving the user clicked a UI affordance for that exact payload. Wallets controlled by users (external EOAs) cannot be server-signed; the wallet API returns `not_supported_yet` until a future PR adds `signature_challenges`.

Both are enforced by branded TS types, runtime DB invariants, and a dev/staging response-body tripwire.

### Critical clarifications (v3)

- **Hydra access tokens are opaque, not JWTs.** Verifier uses cached introspection (~10ms uncached, <1ms cached, 30s TTL).
- **Authorities are NEVER auto-issued.** Issuance is at-call-site only, just-in-time, single-use, payload-bound.
- **Hydra has native RFC 8628 device flow.** No custom `/oauth/device/*` routes; reuse Hydra's `/oauth2/device/auth` with a thin verification UI.
- **Logout writes tombstone FIRST (DB-backed), then revokes/end-sessions.** Fail-closed: if Hydra revoke fails, the tombstone still rejects future requests.
- **State-mutating routes accept Bearer only.** Cookie is for navigation/SSR reads (idempotent GETs). The browser reads access token from a non-HttpOnly companion cookie `vana_access` and sends it as `Authorization: Bearer` for any POST/PUT/PATCH/DELETE. Drops the entire CSRF infrastructure.
- **Tombstone storage is `vana_session_tombstones` table** (Postgres), not in-process. Multi-lambda safe.

## Goal

When this work lands:

- Hydra issues opaque Vana session tokens (access + refresh) with `sub = VanaUserId`.
- Every authenticated route in `account.vana.org` reads its session via a single `getVanaSession(req)` verifier (cached Hydra introspection + DB tombstone check).
- State-mutating routes accept Bearer only; cookie for reads only.
- Server-side signing flows through `wallet.signTypedData(...)` with a closed `purpose` enum and a freshly-issued, single-use, payload-bound `signing_authorization`. The Privy SDK call and the authority row are written in the same DB transaction (no TOCTOU).
- High-risk purposes (`create_grant`, `register_personal_server`) require an `interactive_confirmation` issued ≤5min ago, where the displayed summary was derived from the same serialization as the authority's `payload_hash`.
- `data-connect` supports both local-bundled and remote PS, configurable via Settings, and authenticates to remote PS using Vana session tokens minted via Hydra's native device-code flow.
- Personal Server accepts a Vana session as an owner-equivalent auth mechanism via account.vana.org-proxied introspection.
- Memory App fetches real ChatGPT memories from the user's remote PS using a real grant, end-to-end.

## Out of scope (explicit)

- Para or Dynamic adapter implementation. Designed for; not built.
- Smart-account / EIP-7702 / session keys on-chain. `key_control_type` enum extensible; no implementation.
- Production deployment. Everything ships to dev.
- `signature_challenges` table — deferred until first interactive EOA flow.
- `wallet_attestations` table — deferred until smart-account flow.
- KMS migration of `PRIVY_SIGNER_PRIVATE_KEY`. Documented as known security debt; addressed separately.
- Privy bridge nonce mechanism. Audience-pin + 5min `iat` skew + bound-to-begin-cookie covers single-user dev. Add full nonce when there are multiple users.
- CI grep on PCI. Replaced by branded types + runtime tripwire.

## Stages

| #   | Stage                                                             | Type         | Depends on |
| --- | ----------------------------------------------------------------- | ------------ | ---------- |
| 0   | Discovery + critique-driven revision                              | done         | —          |
| 1   | Architecture design doc                                           | doc          | 0          |
| 2   | Schema additions/changes                                          | code         | 1          |
| 3   | Vana session-token plane (Hydra config + verifier)                | code         | 1, 2       |
| 4   | Atomic per-flow cutover (3 PRs)                                   | code         | 3, 5       |
| 5   | Signing authority plane                                           | code         | 1, 2, 3    |
| 6   | Branded `VanaUserId` type + dev tripwire                          | code         | 3          |
| 7   | data-connect remote PS + Hydra device-code + PS Vana-session auth | code         | 3, 5       |
| 8   | Memory App regression + end-to-end runbook                        | manual + doc | 4, 5, 6, 7 |

**v3 simplification:** Stage 4 cut from 8 PRs to 3 (route auth swap, servers+register-on-chain atomic, device flow decommission).

## Stage 0 — Discovery + critiques (DONE)

- 3 audits (routes, signing, schema)
- Round-1 critiques folded (4 reviewers)
- Round-2 critiques folded (3 reviewers)

## Stage 1 — Architecture design doc

**Output:** `01-architecture.md` containing 1.1–1.12 below. Tim signs off before stage 2.

### 1.1 Invariants

PCI and SAI as formal statements. Branded type:

```ts
type VanaUserId = string & { readonly __brand: 'VanaUserId' };
function assertVanaUserId(v: string): asserts v is VanaUserId { ... }
```

Brand does not exist today (round-2 #B.7). Stage 6 creates and sweeps.

### 1.2 Schema DDL (exact)

```sql
CREATE TABLE signing_authorizations (
  id              text PRIMARY KEY,
  vana_user_id    text NOT NULL REFERENCES vana_users(id),
  vana_wallet_id  text NOT NULL REFERENCES vana_linked_wallets(id),
  hydra_session_id text NOT NULL,
  purpose         text NOT NULL,
  payload_hash    text NOT NULL,
  payload_summary jsonb NOT NULL,
  confirmation_id text REFERENCES interactive_confirmations(id),
  max_uses        int  NOT NULL DEFAULT 1,
  used_count      int  NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_signing_auth_unconsumed_payload
  ON signing_authorizations (payload_hash) WHERE consumed_at IS NULL;
CREATE INDEX ix_signing_auth_user ON signing_authorizations (vana_user_id);

CREATE TABLE interactive_confirmations (
  id              text PRIMARY KEY,
  vana_user_id    text NOT NULL REFERENCES vana_users(id),
  hydra_session_id text NOT NULL,
  vana_wallet_id  text NOT NULL REFERENCES vana_linked_wallets(id),
  purpose         text NOT NULL,
  payload_hash    text NOT NULL,
  payload_summary jsonb NOT NULL,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_confirmations_session ON interactive_confirmations (hydra_session_id);

CREATE TABLE vana_refresh_tokens (
  id                text PRIMARY KEY,
  vana_user_id      text NOT NULL REFERENCES vana_users(id),
  hydra_session_id  text NOT NULL,
  refresh_token_enc bytea NOT NULL,
  iv                bytea NOT NULL,
  auth_tag          bytea NOT NULL,
  family_id         text NOT NULL,
  expires_at        timestamptz NOT NULL,
  rotated_at        timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_user ON vana_refresh_tokens (vana_user_id);
CREATE INDEX ix_refresh_family ON vana_refresh_tokens (family_id);

CREATE TABLE vana_session_tombstones (
  hydra_session_id text PRIMARY KEY,
  vana_user_id     text NOT NULL,
  revoked_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);

ALTER TABLE vana_linked_wallets
  ADD COLUMN key_control_type text NOT NULL DEFAULT 'provider_embedded'
  CHECK (key_control_type IN ('provider_embedded', 'user_controlled_eoa', 'smart_account'));

ALTER TABLE oauth_clients ADD COLUMN owner_vana_user_id text;
```

**KEK:** `REFRESH_TOKEN_ENC_KEY` is a Vercel encrypted env var, **distinct from `PRIVY_SIGNER_PRIVATE_KEY`**. AES-256-GCM with per-row IV. Documented in `security-debt.md`.

### 1.3 Closed `purpose` enum

```ts
type SigningPurpose =
  | "register_personal_server" // high-risk
  | "register_personal_server_deregistration" // high-risk
  | "create_grant" // high-risk
  | "revoke_grant"; // not high-risk
const HIGH_RISK_PURPOSES: ReadonlySet<SigningPurpose> = new Set([
  "register_personal_server",
  "register_personal_server_deregistration",
  "create_grant",
]);
```

`register_builder` is NOT in this enum (server-generated EOA, builder identity).

Each purpose maps to:

- A typed-data validator (validates `domain.name`, `chainId`, `verifyingContract`, `primaryType`, message field schema).
- A summary template (deterministic — every typed-data field appears in summary or validator fails closed).

### 1.4 `getVanaSession(req)` API

```ts
type VanaSession = {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  scope: string[];
  audience: string[];
};

async function getVanaSession(req: Request): Promise<VanaSession | null>;
```

Behavior:

1. Pull token from `Authorization: Bearer <token>`. If absent and method is GET/HEAD/OPTIONS, fall back to `vana_session` cookie. Otherwise return null.
2. Cache lookup `(sha256(token) → introspection_result)` with 30s TTL.
3. On cache miss: POST `https://hydra-admin/admin/oauth2/introspect` with `token=<token>`. Cache 30s.
4. Verify `active === true`, `iss === HYDRA_PUBLIC_URL`, `aud` includes `account.vana.org`, `exp` not exceeded with ±60s skew.
5. Check `vana_session_tombstones` for `hydra_session_id`. If found, return null.
6. Coerce `sub` via `assertVanaUserId`.
7. Return `VanaSession` or null.

### 1.5 `wallet.signTypedData(...)` API

```ts
type SigningRequest = {
  vanaUserId: VanaUserId;
  vanaWalletId?: string;
  purpose: SigningPurpose;
  typedData: TypedDataDefinition;
  confirmationId?: string;
};

type SigningResult =
  | { kind: "signature"; signature: Hex; authorizationId: string }
  | { kind: "not_supported_yet"; reason: "user_controlled_eoa" }
  | {
      kind: "confirmation_required";
      confirmationId: string;
      payloadSummary: object;
      expiresAt: string;
    };
```

Implementation:

- Resolve wallet (primary if not specified).
- If `key_control_type === 'user_controlled_eoa'`: `not_supported_yet`. Identical response shape regardless of wallet existence.
- Validate purpose against typed data.
- Compute `payload_hash = sha256(canonicalize(typedData))`.
- Compute `payload_summary` from typed data via deterministic template.
- For HIGH_RISK_PURPOSES: require `confirmationId`; look up by id, hydra_session_id, vana_user_id, purpose, **payload_hash**. Missing/expired/consumed/payload mismatch → `confirmation_required` with freshly-issued row.
- **Single transaction:** INSERT `signing_authorizations` (`max_uses=1, expires_at=now()+60s, payload_hash, payload_summary, confirmation_id`); call Privy.signTypedData; UPDATE `SET used_count=1, consumed_at=now() WHERE id=$id AND used_count=0 RETURNING *`. 0 rows → throw + roll back.

### 1.6 Interactive confirmation lifecycle

**Browser flow:**

1. Route detects HIGH_RISK_PURPOSES with no/invalid `confirmationId`. Returns 401 `{ error: "confirmation_required", confirmation_id, payload_summary, expires_at }`.
2. Client renders **inline modal** (round-2 simplicity #1) showing summary, "Confirm" button, expires_at countdown.
3. User clicks Confirm. Client POSTs `/api/auth/confirmations/:id/consume`.
4. Server atomically `UPDATE interactive_confirmations SET consumed_at=now() WHERE id=$id AND consumed_at IS NULL AND expires_at > now()`. 0 rows → 409.
5. Client retries with `x-vana-confirmation-id` header.
6. Route loads confirmation, verifies consumed within 30s grace and not bound to an authority, calls `wallet.signTypedData({confirmationId})`.

**Idempotency:** retry with consumed confirmation → return cached signature via lookup `confirmations.id → signing_authorizations.confirmation_id`. 30s grace window.

**TTLs:** confirmation row 5min (UX-friendly); resulting authority 60s.

**Tauri/non-browser callers:**

- Tauri shell-opens `confirmation_url`.
- Polls `GET /api/auth/confirmations/:id/status` every 2s.
- On `confirmed`, retries with `x-vana-confirmation-id`.

**Per-payload keying:** Two routes simultaneously → two distinct rows by `payload_hash`.

### 1.7 Hydra session token format & logout

- Access: opaque `ory_at_*`, 15min TTL.
- Refresh: opaque `ory_rt_*`, 30 day TTL, rotated each use, family-tracked, reuse → family revoked.
- `sub = VanaUserId`, `aud` array.
- Refresh stored encrypted in `vana_refresh_tokens` (1.2 KEK).

**Logout (fail-closed):**

1. INSERT `vana_session_tombstones` row — **first**.
2. Clear `vana_session` and `vana_access` cookies.
3. POST Hydra `/oauth2/revoke` (best-effort).
4. POST Hydra `/oauth2/sessions/logout` (best-effort).
5. Mark `vana_refresh_tokens.revoked_at`.

Best-effort failures retried by background job. Tombstone is the security boundary.

### 1.8 Hydra device-code integration

- Register `data-connect` Hydra OAuth client with `grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token']`, `audience: ['account.vana.org', '<dynamic per-user PS URL>']`, `token_endpoint_auth_method: 'none'`, `access_token_strategy: 'opaque'`.
- account.vana.org `/auth/device` UI: user confirms user_code, page calls Hydra admin `getDeviceUserCodeRequest` + `acceptUserCodeRequest`.
- data-connect calls Hydra's native `/oauth2/device/auth` directly.

**Token audience for PS access:** consent grants `aud = ['account.vana.org', 'https://<user-ps-url>.myvana.app']`. PS URL resolved from `personal_servers` by `vanaUserId`.

### 1.9 PS-side Vana session integration

PS gets a fifth auth mechanism in `web3-auth.ts`: `vana-session`.

- PS calls `account.vana.org/api/oauth/introspect` (proxy account.vana.org owns, which calls Hydra admin internally). Keeps Hydra admin credentials out of PS.
- Proxy returns RFC 7662 fields plus `linked_wallets[]`.
- PS extracts `wallet_address = linked_wallets[0].address`. Sets `auth.signer = walletAddress`.
- PS validates `aud` includes own URL.
- vana-session path is owner-equivalent.

### 1.10 Per-flow migration (3 PR groups)

| Group                                  | Routes                                                                                                                                              | Signing site                                          | Atomicity    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| **PR-Y: route auth swap, non-signing** | `/api/auth/session`, `/auth/oidc/login`, `/auth/oidc/consent`, `/api/account/access*` (8), `/api/account/actions*` (5), `/api/admin/oauth-clients*` | none                                                  | Yes          |
| **PR-X: servers + register-on-chain**  | `/api/servers`, `/api/servers/[id]` GET/DELETE, `/api/servers/[id]/register-on-chain`                                                               | `register-on-chain.ts` swap to `wallet.signTypedData` | Yes — atomic |
| **PR-Z: device flow decommission**     | delete `/api/auth/device*` legacy; add `/auth/device` UI                                                                                            | none                                                  | Yes          |

**Within PR-X (round-2 #B.2 explicit client work):**

- `useServer.ts` stops computing `masterKeySignature`.
- `useServer.ts` handles `401 confirmation_required` → inline modal → POST consume → retry with `x-vana-confirmation-id`.
- Route accepts only `getVanaSession`.
- `register-on-chain.ts` calls `wallet.signTypedData` with `confirmationEventId`.

### 1.11 Provider Containment enforcement

- **Branded type** `VanaUserId` (Stage 6).
- **Dev/staging tripwire:** middleware scans response bodies for `did:privy:` regex; fails request loudly.
- **Code review checklist** in `02-code-review-checklist.md`.
- **No CI grep.**

### 1.12 Open questions (resolved before stage 2)

- Confirm "opaque + introspection + DB tombstone" choice (vs JWT + JWKS).
- Confirm 15min/30day TTLs.
- Confirm inline modal UX.
- Confirm dropping CSRF plane in favor of Bearer-only state-mutation.
- Confirm deferring Privy nonce mechanism.

**Acceptance:** Tim signs off. No code moves until then.

## Stage 2 — Schema additions/changes

**Output:** Single PR.

2.1 Migration `008_auth_signing_plane.sql` containing 1.2 DDL.
2.2 Repo functions in `src/lib/db/auth-signing.ts` and `src/lib/db/sessions.ts`.
2.3 Tests:

- Atomic increment of `used_count` (concurrency)
- Partial UNIQUE on `payload_hash` rejects double-spend
- Idempotent confirmation consume
- Refresh-token reuse detection (rotated token presented → family revoked)
  2.4 Migration comment explaining SAI guarantees.

## Stage 3 — Vana session-token plane

3.1 `src/lib/auth/vana-session.ts` — `getVanaSession(req)` per 1.4.
3.2 Hydra config setup script: updates `data-connect` OAuth client.
3.3 `/api/auth/session` rewrite per 1.7. Audience-pinned to `PRIVY_APP_ID` (assert + unit test). 5min `iat` skew. Bound to same-origin HttpOnly `vana_session_begin_cookie` set on `/api/auth/session/begin` precursor.
3.4 `/auth/device` UI page calling `getDeviceUserCodeRequest` + `acceptUserCodeRequest`.
3.5 `.well-known/oauth-authorization-server` proxy.
3.6 `/api/auth/logout` per 1.7 logout sequence.
3.7 Browser session bootstrap: on login, set `vana_session` (HttpOnly) AND `vana_access` (JS-readable). Client fetch helpers send `vana_access` as Bearer for state-mutating calls.
3.8 `/api/oauth/introspect` proxy for PS (per 1.9).
3.9 Tests: cookie-only-on-GET, Bearer required for POST, expired token, refresh, tombstone rejection, audience pin (foreign-app token rejected), nonce-cookie binding.

## Stage 4 — Atomic per-flow cutovers (3 PRs)

**PR-Y (route auth swap, non-signing).** All non-signing routes migrate from existing auth to `getVanaSession`. Privy bridge stays at `/api/auth/session` (sole `privyClient.users().get()` call). `oauth_clients.owner_vana_user_id` populated; `owner_address` dropped in follow-up. Browser hooks stop computing master-key per-request.

**PR-X (servers + register-on-chain, atomic with signing).** Per 1.10. Includes the four explicit `useServer` client changes. Stage 5 lands first.

**PR-Z (device flow decommission).** Delete legacy `/api/auth/device/*`. Memory App and other consumers swap to Hydra device flow.

## Stage 5 — Signing authority plane

5.1 `src/lib/auth/signing-purposes.ts` — closed enum + per-purpose validators + summary templates.
5.2 `src/lib/auth/wallet.ts` — `wallet.signTypedData(...)` per 1.5. Single-tx insert+sign+update.
5.3 `src/lib/auth/wallet-providers/privy.ts` — Privy adapter, sole `@privy-io/node` import for signing.
5.4 `src/lib/auth/interactive-confirmations.ts` — issue, status, consume.
5.5 `/api/auth/confirmations/:id/consume` (POST), `/api/auth/confirmations/:id/status` (GET).
5.6 Inline modal component mounted in app shell.
5.7 Delete legacy `/api/sign` route.
5.8 No auto-issued authorities.
5.9 Tests:

- Replay rejected (UNIQUE on unconsumed payload_hash)
- Single-tx invariant
- Confirmation summary derived from same canonicalize() as authority hash
- Validator rejects payload with fields not in summary template
- `not_supported_yet` shape identical for missing wallet vs user-EOA vs feature-off
- Idempotent re-consume returns cached signature

## Stage 6 — Branded `VanaUserId` type + dev tripwire

6.1 `src/lib/auth/branded-ids.ts`: `type VanaUserId = string & { readonly __brand: 'VanaUserId' }`.
6.2 `assertVanaUserId(v: string): asserts v is VanaUserId`.
6.3 Sweep call sites taking `vanaUserId: string` → `vanaUserId: VanaUserId`. Compiler enforces narrow-to-brand at boundaries.
6.4 Dev/staging response-body tripwire middleware (`did:privy:` regex).
6.5 `02-code-review-checklist.md`.

## Stage 7 — data-connect remote PS + Hydra device-code + PS Vana-session

**7a. PR to personal-server-ts:**

- `web3-auth.ts` adds vana-session mechanism per 1.9.
- Calls `${ACCOUNT_URL}/api/oauth/introspect`.
- Validates `aud` includes own URL.
- Uses `linked_wallets[0].address` as `auth.signer`.

**7b. PR to data-connect:**

- `AppConfig.serverMode: 'local' | 'remote'`, `remoteServerUrl: string`.
- `usePersonalServer` skips Tauri startup when remote; exposes `serverBaseUrl`.
- `personalServerIngest.ts` accepts base URL + Bearer.
- Settings UI: server mode toggle, remote URL input, "Connect with Vana" button.
- Login with Vana: Tauri calls Hydra `/oauth2/device/auth`, polls `/oauth2/token`, stores tokens in Tauri secure storage. Calls `account.vana.org/api/servers` (Bearer) → discovers PS URL → auto-populates.
- Confirmation polling: when 401 confirmation_required, shell-open `confirmation_url`, poll status, retry with `x-vana-confirmation-id`.

## Stage 8 — Memory App regression + runbook

8.1 Verify Memory App demo still works after Stage 4. Re-mint grant; fetch real ChatGPT memories.

8.2 Write `10-runbook.md`:

- Pre-flight checks
- Two manual steps (Privy login, ChatGPT Playwright login)
- Step-by-step end-to-end

## Sub-agent allocation

- **Stage 1**: I write `01-architecture.md` (load-bearing).
- **Stage 2**: agent writes migration SQL + types + tests; I review.
- **Stage 3**: I write the verifier; agent writes `/api/auth/session`, `/auth/device`, `/api/oauth/introspect` proxy in parallel.
- **Stage 4**: I do PR-X (atomic + load-bearing). Agent does PR-Y (mechanical). Agent does PR-Z (small).
- **Stage 5**: I write the wallet API + Privy adapter; agent writes confirmation routes + modal + tests in parallel.
- **Stage 6**: agent does sweep; I do tripwire.
- **Stage 7**: I do PS-side; agent does data-connect Settings UI; I do data-connect ingest+device-flow integration.
- **Stage 8**: manual.

## Risk register

| Risk                                          | Mitigation                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hydra introspection cache stale on revocation | Tombstone DB check on every cache hit (multi-lambda safe)                           |
| Per-request introspection latency             | Cached 30s; ~10ms uncached                                                          |
| Confirmation UX friction                      | 5min TTL on confirmation row, 60s on resulting authority; inline modal not redirect |
| Tauri confirmation roundtrip                  | Status polling endpoint                                                             |
| Refresh-token KEK env var leak                | KEK distinct from PRIVY signer key; debt documented; KMS migration follow-up        |
| `PRIVY_SIGNER_PRIVATE_KEY` leak               | New authority plane shrinks blast radius; debt documented                           |
| PS introspection coupled to account.vana.org  | Intentional; PS can fall back to legacy mechanisms if account.vana.org down         |
| Branded type sweep churn                      | Stage 6 only; compiler-enforced once landed                                         |

## Definition of done

- [ ] All authenticated routes use `getVanaSession`; no master-key recovery anywhere.
- [ ] Server-side signing flows through `wallet.signTypedData` with single-tx authority + payload binding.
- [ ] HIGH_RISK_PURPOSES require interactive_confirmation with verbatim summary tied to payload_hash.
- [ ] No `privyClient.users().get()` outside `/api/auth/session`. No `privyClient.wallets()` outside Privy adapter.
- [ ] Dev tripwire passes (no `did:privy:` in response bodies).
- [ ] `VanaUserId` is a TS brand, enforced at compile time.
- [ ] Logout writes tombstone first; revoke is best-effort.
- [ ] State-mutating routes Bearer-only.
- [ ] data-connect: configure remote PS via Login with Vana (Hydra device flow); ingest works.
- [ ] PS accepts Vana session via account.vana.org-proxied introspection.
- [ ] Memory App fetches real ChatGPT memories end-to-end.
- [ ] Runbook exists; Tim can validate end-to-end with two manual steps.

## Next action

Begin Stage 1: write `01-architecture.md`.
