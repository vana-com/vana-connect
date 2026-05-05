# Vana Auth & Custody Architecture

Status: design, awaiting Tim sign-off
Owner: Tim
Author: claude
Last updated: 2026-05-04
Companion to: `00-execution-plan.md` (v3)

This document is normative. Code and tests must conform; deviations require updating this document first.

---

## Table of contents

1. Invariants (PCI, SAI)
2. Schema (DDL, indexes, encryption)
3. Closed `purpose` enum + per-purpose validators
4. `getVanaSession(req)` API
5. `wallet.signTypedData(...)` API
6. Interactive confirmation lifecycle
7. Hydra session token format & logout
8. Hydra device-code integration
9. PS-side Vana session integration
10. Per-flow migration table
11. Provider Containment enforcement
12. Open questions

---

## 1. Invariants

### 1.1 Provider Containment Invariant (PCI)

> Wallet provider identifiers (`did:privy:*`, Para user IDs, Dynamic IDs, etc.) appear only at login/linking and provider-adapter boundaries. They never appear in business identifiers, OIDC subjects, grant payloads, app permissions, or per-request paths. The only canonical user identifier is `vana_user_id`, expressed as the branded TypeScript type `VanaUserId`.

**Whitelisted call sites** (the only places where `did:privy:*` may legitimately appear):

- `src/app/api/auth/session/route.ts` — Privy bridge: receives `id_token`, verifies via Privy SDK, resolves to `VanaUserId`. The Privy DID is persisted only in `vana_provider_links.provider_subject`.
- `src/lib/auth/wallet-providers/privy.ts` — Privy custody adapter: maps `(VanaUserId, vanaWalletId)` → Privy `walletId` for SDK calls.
- `src/lib/db/account.ts` `findUserByProviderSubject(...)` — login-time lookup.

Anywhere else, a Privy DID is a bug. Enforced by:

- **Compile-time:** branded `VanaUserId` type (cannot accept a raw `string`).
- **Runtime:** dev/staging response-body tripwire (Stage 6) scans for `did:privy:` regex; fails request loudly.
- **Code review:** checklist in `02-code-review-checklist.md`.

The brand:

```ts
// src/lib/auth/branded-ids.ts (Stage 6)
export type VanaUserId = string & { readonly __brand: "VanaUserId" };

const VANA_USER_ID_RE = /^vana_user_[0-9a-f]{32}$/;

export function assertVanaUserId(v: string): asserts v is VanaUserId {
  if (!VANA_USER_ID_RE.test(v)) {
    throw new Error(`assertVanaUserId: not a vana_user_id: ${v.slice(0, 24)}…`);
  }
}

export function asVanaUserId(v: string): VanaUserId {
  assertVanaUserId(v);
  return v;
}
```

The brand discriminator (`__brand`) exists only at the type level; at runtime `VanaUserId` is a plain `string`. The brand prevents accidental cross-assignment from `string` (e.g., `did:privy:...`) without explicit validation.

### 1.2 Signing Authority Invariant (SAI)

> Server-side signing on a user's behalf requires an explicit, single-use, payload-bound `signing_authorization` row, issued at the call site that needs it. The Privy SDK call and the authority row are written in the same DB transaction (no TOCTOU). High-risk purposes additionally require an `interactive_confirmation` row issued ≤5min ago, where the user reviewed a verbatim summary of the payload. Wallets controlled by users (external EOAs, `key_control_type = 'user_controlled_eoa'`) cannot be server-signed; the wallet API returns `not_supported_yet`.

Concrete consequences:

- No code path may call `Privy.signTypedData(...)` (or any provider equivalent) outside `src/lib/auth/wallet-providers/*.ts`.
- The wallet API is the only entry point. It enforces purpose validation, payload hashing, summary derivation, confirmation lookup (for high-risk purposes), and atomic authority insert+sign+update.
- A leak of `PRIVY_SIGNER_PRIVATE_KEY` cannot mint signatures by itself: an attacker also needs (a) a valid Vana session for the target user, (b) for high-risk purposes, an `interactive_confirmations` row consumed ≤30s ago.
- A `signing_authorization` row is single-use (`max_uses = 1`) and uniquely indexed on `payload_hash` while unconsumed (partial UNIQUE), so the same payload cannot be replayed even within the 60s authority TTL.

---

## 2. Schema

### 2.1 New / changed tables

```sql
-- Migration 008_auth_signing_plane.sql

-- Per-call-site authorization for a single signing operation.
-- Inserted, used, consumed inside the same DB transaction as the Privy SDK call.
CREATE TABLE signing_authorizations (
  id              text PRIMARY KEY,
  vana_user_id    text NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  vana_wallet_id  text NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
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
  vana_user_id    text NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
  hydra_session_id text NOT NULL,
  vana_wallet_id  text NOT NULL REFERENCES vana_linked_wallets(id) ON DELETE CASCADE,
  purpose         text NOT NULL,
  payload_hash    text NOT NULL,
  payload_summary jsonb NOT NULL,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_confirmations_session ON interactive_confirmations (hydra_session_id);
CREATE INDEX ix_confirmations_payload ON interactive_confirmations (payload_hash);

CREATE TABLE vana_refresh_tokens (
  id                text PRIMARY KEY,
  vana_user_id      text NOT NULL REFERENCES vana_users(id) ON DELETE CASCADE,
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

### 2.2 KEK (Key Encryption Key) for refresh tokens

- `REFRESH_TOKEN_ENC_KEY`: 32-byte (256-bit) base64-encoded random key.
- Stored as a Vercel encrypted env var. **Distinct** from `PRIVY_SIGNER_PRIVATE_KEY`.
- Algorithm: **AES-256-GCM** with a fresh random 12-byte IV per row. 16-byte authentication tag stored alongside.
- Rotation: maintenance script re-encrypts rows. Both old and new KEK env vars present during rotation; reads try new first, fall back to old; on success, re-encrypts with new key.
- Documented in `security-debt.md`; KMS migration is the long-term path.

### 2.3 Canonicalization

`payload_hash = sha256(canonicalize(typedData))`. Canonicalization is **JCS** (RFC 8785, JSON Canonicalization Scheme):

- Numbers serialized per ECMAScript spec (no leading zeros, no trailing decimals).
- Object keys sorted lexicographically (UTF-16 code-unit order).
- No whitespace.
- UTF-8 output.

The same canonicalize+hash function is used by `wallet.signTypedData`, by the validator that rejects mismatched payloads, and by the confirmation route. Located at `src/lib/auth/payload-hash.ts`.

---

## 3. Closed `purpose` enum

```ts
// src/lib/auth/signing-purposes.ts

export type SigningPurpose =
  | "register_personal_server" // high-risk
  | "register_personal_server_deregistration" // high-risk
  | "create_grant" // high-risk
  | "revoke_grant"; // not high-risk

export const HIGH_RISK_PURPOSES: ReadonlySet<SigningPurpose> = new Set([
  "register_personal_server",
  "register_personal_server_deregistration",
  "create_grant",
]);
```

`register_builder` is intentionally NOT in this enum. It uses a server-generated EOA whose private key is the _builder's_ identity, not the user's wallet. Documented in `register-builder.ts`.

### 3.1 Per-purpose validators

For each purpose, a validator checks that the typed data conforms exactly to the expected EIP-712 shape. The validator is the same function that drives the summary template.

```ts
type PurposeValidator<P extends SigningPurpose> = {
  validate(
    typedData: TypedDataDefinition,
  ): { ok: true } | { ok: false; reason: string };
  summarize(typedData: TypedDataDefinition): object; // payload_summary
};
```

**`register_personal_server`** validator expects:

```ts
{
  domain: {
    name: 'Vana Data Portability',
    version: '1',
    chainId: VANA_CHAIN_ID,
    verifyingContract: DATA_PORTABILITY_SERVER_CONTRACT,
  },
  primaryType: 'ServerRegistration',
  types: {
    ServerRegistration: [
      { name: 'ownerAddress', type: 'address' },
      { name: 'serverAddress', type: 'address' },
      { name: 'publicKey', type: 'string' },
      { name: 'serverUrl', type: 'string' },
    ],
  },
  message: {
    ownerAddress: <address>,
    serverAddress: <address>,
    publicKey: <0x04 + 128 hex>,
    serverUrl: <https url>,
  },
}
```

Summary template:

```json
{
  "purpose": "register_personal_server",
  "ownerAddress": "0x4Ed0…f8a549",
  "serverAddress": "0xC3E8…cd6e8",
  "publicKey": "0x042a8e…0c988",
  "serverUrl": "https://0x4ed0….myvana.app"
}
```

Every typed-data field appears in the summary. Validator's correctness test (Stage 5.9) asserts: `Set(typedData.message keys) === Set(summary keys minus 'purpose')`. Any unmapped field fails the validator closed.

**`create_grant`** validator: `GrantRegistration` typed data, including `granteeAddress`, `scopes[]`, `expiresAt`, `nonce`. Summary lists all four.

**`register_personal_server_deregistration`** and **`revoke_grant`**: defined when needed; same pattern.

---

## 4. `getVanaSession(req)` API

```ts
// src/lib/auth/vana-session.ts

export type VanaSession = {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  scope: string[];
  audience: string[];
};

export async function getVanaSession(req: Request): Promise<VanaSession | null>;
```

### 4.1 Token extraction

```ts
function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return req.cookies.get("vana_session")?.value ?? null;
  }
  return null; // state-mutating routes must use Bearer
}
```

This is the single point of policy: state-mutating methods reject cookie-only auth. Eliminates CSRF surface entirely for those routes.

### 4.2 Verification path

1. Compute `key = sha256(token)`.
2. Cache lookup: in-process LRU keyed by `key`, 30s TTL, max 10k entries.
3. On hit, deserialize `IntrospectionResult`. Continue to step 5.
4. On miss: `POST ${HYDRA_ADMIN_URL}/admin/oauth2/introspect` with form body `token=<token>` and Google ID-token Bearer (per `hydra-admin.ts:fetchGoogleIdTokenForAudience`). Cache result (positive or negative) for 30s.
5. Validate:
   - `result.active === true` (else return null).
   - `result.iss === HYDRA_PUBLIC_URL`.
   - `result.aud` includes `account.vana.org`.
   - `now() <= result.exp + 60` (60s clock skew tolerance).
   - `result.token_use === 'access_token'`.
6. Tombstone check: `SELECT 1 FROM vana_session_tombstones WHERE hydra_session_id = $1 AND expires_at > now()`. If row found, return null. (Result cached 5s in-process to keep DB load manageable.)
7. `assertVanaUserId(result.sub)` — throws if `sub` is not the canonical shape; caught and treated as null.
8. Return `{ vanaUserId, hydraSessionId, scope, audience }`.

### 4.3 Latency budget

- Cache hit: <1ms (LRU lookup).
- Cache miss: 5–15ms (Hydra round-trip on same VPC region).
- Tombstone DB hit: <2ms (PK lookup, cached 5s).

For high-traffic routes (`/api/account/access`), the 30s cache means N requests in a 30s window cost 1 introspection call.

### 4.4 Negative caching

A 401 introspection result is cached for 30s same as positive. Mitigates rapid-fire brute-force on tokens. If a legitimate user's token is 401 due to revocation, they re-login within 30s of cache-miss; UX cost is one stale 401 in some lambda for ≤30s.

---

## 5. `wallet.signTypedData(...)` API

```ts
// src/lib/auth/wallet.ts

export type SigningRequest = {
  vanaUserId: VanaUserId;
  vanaWalletId?: string; // omit → primary wallet
  purpose: SigningPurpose;
  typedData: TypedDataDefinition;
  confirmationId?: string; // required for HIGH_RISK_PURPOSES
};

export type SigningResult =
  | {
      kind: "signature";
      signature: Hex;
      authorizationId: string;
    }
  | {
      kind: "not_supported_yet";
      reason: "user_controlled_eoa";
    }
  | {
      kind: "confirmation_required";
      confirmationId: string;
      payloadSummary: object;
      expiresAt: string;
    };

export async function signTypedData(
  req: SigningRequest,
): Promise<SigningResult>;
```

### 5.1 Implementation flow

1. Resolve wallet:
   - If `vanaWalletId` specified, look up by id; else find `is_primary = true` for `vanaUserId`.
   - If no wallet found: return `not_supported_yet`. Response shape MUST be identical to the user-EOA case to prevent enumeration of wallet existence.
2. If `wallet.key_control_type === 'user_controlled_eoa'`: return `not_supported_yet`.
3. Validate `purpose` against `typedData` via the per-purpose validator. Validator failure → throw.
4. Compute `payload_hash = sha256(canonicalize(typedData))`.
5. Compute `payload_summary = validator.summarize(typedData)`.
6. **High-risk gate.** If `purpose ∈ HIGH_RISK_PURPOSES`:
   - If `confirmationId` is missing: issue a fresh `interactive_confirmations` row (id, vana_user_id, hydra_session_id, vana_wallet_id, purpose, payload_hash, payload_summary, expires_at = now()+5min, consumed_at = NULL). Return `{ kind: 'confirmation_required', confirmationId, payloadSummary, expiresAt }`.
   - If present: load by id; verify hydra_session_id, vana_user_id, purpose, payload_hash all match; verify `consumed_at IS NOT NULL` AND consumed within 30s grace; verify no existing `signing_authorization.confirmation_id = id`. If any fails: issue a fresh confirmation as above. (This path is for first-attempt; idempotent retry-after-network-blip is step 8.)
7. **Atomic transaction.** Inside the same tx:
   - INSERT `signing_authorizations` row (`max_uses = 1, used_count = 0, expires_at = now()+60s, payload_hash, payload_summary, confirmation_id`). Partial UNIQUE on `payload_hash` rejects double-spend.
   - Call `Privy.signTypedData(walletProviderId, typedData)` synchronously via `wallet-providers/privy.ts`.
   - UPDATE `signing_authorizations SET used_count = 1, consumed_at = now() WHERE id = $id AND used_count = 0`. Verify exactly 1 row updated.
   - COMMIT.
8. **Idempotency on retry.** If the route is retried with a `confirmationId` whose authority was already created and consumed within the last 30s (network blip after Privy returned), look up the existing `signing_authorizations` row by `confirmation_id`, verify it's consumed, return its cached `signature`. No double-sign.
9. Return `{ kind: 'signature', signature, authorizationId: row.id }`.

**Failure modes:**

- INSERT fails on UNIQUE conflict: another tx is mid-sign for the same payload. Roll back, return error to caller.
- Privy SDK throws: roll back tx (authority row never committed); propagate error.
- UPDATE returns 0 rows: should be impossible given UNIQUE; if it happens, treat as catastrophic (alert), roll back, return error.

### 5.2 Privy adapter contract

```ts
// src/lib/auth/wallet-providers/privy.ts (Stage 5)

export interface CustodyAdapter {
  signTypedData(args: {
    walletProviderId: string; // Privy walletId, opaque to callers
    typedData: TypedDataDefinition;
  }): Promise<{ signature: Hex }>;
}

export const privyAdapter: CustodyAdapter = {
  /* ... */
};
```

The adapter is the only file in the codebase that imports `@privy-io/node` for signing. Receives an opaque `walletProviderId` and never sees Privy DIDs.

---

## 6. Interactive confirmation lifecycle

### 6.1 Browser flow

Sequence (PR-X example: register-on-chain on /server page):

```
[Client]                          [Route]                      [DB]
   |                                  |                          |
   |-- POST /api/servers/.../         |                          |
   |   register-on-chain (Bearer)     |                          |
   |--------------------------------->|                          |
   |                                  |-- wallet.signTypedData   |
   |                                  |   (no confirmationId)    |
   |                                  |   ↓                      |
   |                                  |-- INSERT confirmation -->|
   |                                  |<-- row.id ---------------|
   |  401 confirmation_required       |                          |
   |  { id, payload_summary,          |                          |
   |    expires_at }                  |                          |
   |<---------------------------------|                          |
   |                                  |                          |
   | [Inline modal renders]           |                          |
   | [User reviews, clicks Confirm]   |                          |
   |                                  |                          |
   |-- POST /api/auth/confirmations/  |                          |
   |    :id/consume (Bearer)          |                          |
   |--------------------------------->|                          |
   |                                  |-- UPDATE consumed_at --->|
   |                                  |   WHERE id=$id AND       |
   |                                  |   consumed_at IS NULL    |
   |                                  |<-- 1 row ----------------|
   |  200 ok                          |                          |
   |<---------------------------------|                          |
   |                                  |                          |
   |-- POST /api/servers/.../         |                          |
   |   register-on-chain              |                          |
   |   x-vana-confirmation-id: <id>   |                          |
   |--------------------------------->|                          |
   |                                  |-- wallet.signTypedData   |
   |                                  |   ({confirmationId})     |
   |                                  |   ↓                      |
   |                                  |-- BEGIN tx               |
   |                                  |-- INSERT authorization ->|
   |                                  |-- Privy.signTypedData    |
   |                                  |-- UPDATE authorization ->|
   |                                  |-- COMMIT                 |
   |  200 { signature, ... }          |                          |
   |<---------------------------------|                          |
```

### 6.2 Idempotency on network blip

If the second register-on-chain POST fails partway and the client retries with the same `confirmation_id`:

- The route loads the confirmation, sees `consumed_at` is set (≤30s ago), looks up `signing_authorizations` by `confirmation_id`, finds the existing row, returns its cached signature.
- No double-sign. Privy SDK is NOT called again.
- 30s grace window is configurable.

### 6.3 TTL strategy

- `interactive_confirmations.expires_at`: now()+5min. UX-friendly: cautious users can read carefully.
- `signing_authorizations.expires_at`: now()+60s. Tight: this row exists for the duration of the Privy SDK call.

The two TTLs are deliberately decoupled. Round-1 critique flagged conflating them.

### 6.4 Per-payload keying

Two routes simultaneously triggering confirmations:

- Each call site issues a confirmation with a distinct `payload_hash`.
- Two separate `interactive_confirmations` rows.
- Client tracks per-`confirmation.id`, not a singleton flag.
- Inline modal supports a stack of pending confirmations, dismissed individually.

### 6.5 Tauri / non-browser callers

For data-connect (Tauri):

- 401 confirmation*required response includes a `confirmation_url` (e.g., `https://account.vana.org/confirm?id=vana_confirm*...`).
- Tauri shell-opens this URL. The user is already logged into account.vana.org in their browser, so the page loads with a Vana session cookie.
- The page renders the same inline modal, calls `/api/auth/confirmations/:id/consume`.
- Meanwhile, data-connect polls `GET /api/auth/confirmations/:id/status` every 2s with its Vana session Bearer. Returns `{ status: 'pending' | 'confirmed' | 'expired' }`.
- On `confirmed`, data-connect retries the original request with `x-vana-confirmation-id` header.

### 6.6 Status endpoint contract

`GET /api/auth/confirmations/:id/status`

- Auth: Bearer.
- Verifies `vana_user_id` matches session.
- Returns:
  - `404` if id unknown.
  - `200 { status: 'pending', expires_at }` if `consumed_at IS NULL AND expires_at > now()`.
  - `200 { status: 'confirmed' }` if `consumed_at IS NOT NULL`.
  - `200 { status: 'expired' }` if `expires_at <= now() AND consumed_at IS NULL`.

Read-only; consumption is the separate `/consume` POST.

### 6.7 Consume endpoint contract

`POST /api/auth/confirmations/:id/consume`

- Auth: Bearer.
- Verifies `vana_user_id` and `hydra_session_id` match session.
- Atomic SQL:
  ```sql
  UPDATE interactive_confirmations
     SET consumed_at = now()
   WHERE id = $id
     AND consumed_at IS NULL
     AND expires_at > now()
     AND vana_user_id = $vu
     AND hydra_session_id = $sid
  RETURNING id;
  ```
- 0 rows: return `409` (already consumed, expired, or session mismatch).
- 1 row: return `200 { ok: true }`.

The route does NOT call `wallet.signTypedData`. That happens when the original route is retried with the consumed confirmation_id.

---

## 7. Hydra session token format & logout

### 7.1 Token shapes

- **Access token**: opaque (Hydra default), prefix `ory_at_`. 15min TTL. `aud` array. `sub = VanaUserId`. Scope: `openid offline`. `client_id`: `vana-account-web` for browser sessions, `data-connect` for Tauri.
- **Refresh token**: opaque, prefix `ory_rt_`. 30 day TTL. Rotated each `/oauth2/token` exchange. Family-tracked: each rotation produces a new token whose `family_id` matches its predecessor's. If a previously-rotated token is presented, the entire family is revoked (reuse detection).
- **ID token**: standard OIDC claims. `sub = VanaUserId`. Issued for OIDC clients (Memory App); not used for first-party session.

### 7.2 Hydra client config

```jsonc
// vana-account-web (browser session)
{
  "client_id": "vana-account-web",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid offline",
  "audience": ["account.vana.org"],
  "redirect_uris": ["https://account.vana.org/auth/oidc/callback"],
  "token_endpoint_auth_method": "none",
  "access_token_strategy": "opaque",
  "lifespan": {
    "authorization_code_grant_access_token": "15m",
    "authorization_code_grant_refresh_token": "30d",
    "refresh_token_grant_access_token": "15m",
    "refresh_token_grant_refresh_token": "30d"
  }
}

// data-connect (device flow)
{
  "client_id": "data-connect",
  "grant_types": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  "scope": "openid offline",
  "audience": ["account.vana.org"],   // additional audiences (PS URL) added per consent
  "token_endpoint_auth_method": "none",
  "access_token_strategy": "opaque",
  "lifespan": { /* same as above */ }
}
```

### 7.3 Refresh token storage

Stored encrypted in `vana_refresh_tokens`. Inserted during login, rotated on each refresh.

```ts
async function storeRefreshToken(args: {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  refreshToken: string; // raw ory_rt_*
  familyId: string; // shared across rotations
  expiresAt: Date;
}): Promise<{ id: string }> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEK, iv);
  const ciphertext = Buffer.concat([
    cipher.update(args.refreshToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // INSERT (id, vana_user_id, hydra_session_id, refresh_token_enc=ciphertext, iv, auth_tag=tag, family_id, expires_at)
}
```

Decryption on rotation reads the row, decrypts with KEK, presents to Hydra `/oauth2/token` with `grant_type=refresh_token`. On success: marks row as `rotated_at = now()`, INSERTs new row with same `family_id`, returns new tokens.

If the presented refresh token is found in a row with `rotated_at IS NOT NULL`, that's reuse: UPDATE all rows with that `family_id` to `revoked_at = now()`. The session is now dead; future access tokens for the family are also tombstoned.

### 7.4 Logout sequence (fail-closed)

```
1. INSERT vana_session_tombstones (hydra_session_id, vana_user_id,
                                   expires_at = now() + 30m)         [DB write, multi-lambda visible]
2. Set-Cookie: vana_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax
   Set-Cookie: vana_access=;  Max-Age=0; Path=/; Secure; SameSite=Lax
3. POST ${HYDRA_ADMIN_URL}/oauth2/revoke {token: refreshToken}   [best-effort]
4. POST ${HYDRA_ADMIN_URL}/oauth2/sessions/logout
        ?id_token_hint=<id_token>                                [best-effort]
5. UPDATE vana_refresh_tokens SET revoked_at = now()
        WHERE hydra_session_id = $sid                            [DB write]
```

Step 1 is the security boundary. If steps 3-4 fail (Hydra down), the session is still rejected by `getVanaSession`'s tombstone check. Background job retries 3-4 with exponential backoff.

The 30-minute tombstone TTL exceeds the 15-min access-token TTL with safety margin. After 30 minutes, the access token is itself expired; the tombstone can be GC'd.

---

## 8. Hydra device-code integration

### 8.1 Flow (data-connect)

```
[data-connect Tauri]            [Hydra public]              [Hydra admin]            [account.vana.org /auth/device]
     |                                |                           |                              |
     |-- POST /oauth2/device/auth     |                           |                              |
     |   client_id=data-connect       |                           |                              |
     |   scope=openid offline         |                           |                              |
     |--------------------------------->                          |                              |
     |   200 { device_code, user_code,|                           |                              |
     |         verification_uri,      |                           |                              |
     |         verification_uri_      |                           |                              |
     |         complete, expires_in,  |                           |                              |
     |         interval }             |                           |                              |
     |<---------------------------------                          |                              |
     |                                                                                           |
     | [Tauri shell-opens                                                                        |
     |  verification_uri_complete]                                                               |
     |                                                                                           |
     | [User browser hits /auth/device?user_code=ABCD-EFGH; user is logged in to account.vana.org]
     |                                                                                           |--- getDeviceUserCodeRequest
     |                                                                                           |    (challenge=...)
     |                                                                                           |---------------------->
     |                                                                                           |
     |                                                                                           |--- acceptUserCodeRequest
     |                                                                                           |    (challenge=..., subject=vanaUserId,
     |                                                                                           |     audience=[account.vana.org, PS_URL])
     |                                                                                           |---------------------->
     |                                |                           |                              |
     |-- POST /oauth2/token (poll)    |                           |                              |
     |   grant_type=device_code       |                           |                              |
     |--------------------------------->                          |                              |
     |   200 { access_token,          |                           |                              |
     |         refresh_token,         |                           |                              |
     |         expires_in, ... }      |                           |                              |
     |<---------------------------------                          |                              |
     |                                                                                           |
     | [Tauri stores tokens in OS                                                                |
     |  Keychain; calls account.                                                                 |
     |  vana.org/api/servers Bearer]                                                             |
```

### 8.2 PS URL audience

When the user reaches `/auth/device` and `acceptUserCodeRequest` is called server-side, the consent step:

- Looks up the user's PS URL: `SELECT url FROM personal_servers WHERE vana_user_id = $vu AND state = 'running'`.
- Sets `audience = ['account.vana.org', personalServer.url]` on the consent response.
- Hydra mints an access token whose `aud` array contains both.
- PS, on introspection, validates `aud` includes its own URL.

If the user has no PS provisioned, `audience = ['account.vana.org']` only. data-connect will get a token that can fetch `/api/servers` (to provision one or learn there isn't one) but cannot directly write to a PS.

---

## 9. PS-side Vana session integration

### 9.1 Why account.vana.org-proxied introspection

PS is deployed once per user. Embedding Hydra admin credentials in every PS instance is a blast-radius and deployment headache. Instead:

- account.vana.org owns one set of Hydra admin credentials.
- account.vana.org exposes `POST /api/oauth/introspect` (a thin proxy).
- PS calls this proxy with the access token in the body.
- account.vana.org introspects against Hydra admin internally and enriches the response with the user's `linked_wallets` (only account.vana.org has the user→wallets mapping).

### 9.2 Proxy contract

`POST https://account.vana.org/api/oauth/introspect`

- Auth: none required (Hydra introspection itself is unauthenticated; we add rate-limiting per IP and per token to prevent enumeration).
- Body: `{ token: <access_token> }`.
- Response on `active === true`:
  ```json
  {
    "active": true,
    "sub": "vana_user_<32hex>",
    "aud": ["account.vana.org", "https://0x4ed0….myvana.app"],
    "scope": "openid offline",
    "client_id": "data-connect",
    "exp": 1777984500,
    "iat": 1777983600,
    "linked_wallets": [
      {
        "vana_wallet_id": "vana_wallet_<32hex>",
        "address": "0x4Ed0…f8a549",
        "chain_type": "evm",
        "is_primary": true
      }
    ]
  }
  ```
- Response on `active === false`: `{"active": false}`.

### 9.3 PS auth middleware addition

```ts
// personal-server-ts/packages/server/src/middleware/web3-auth.ts

// New mechanism: vana-session
if (authHeader?.startsWith("Bearer ")) {
  const token = authHeader.slice(7);
  // Try control-plane-token, cli-session-token first (existing fast paths).
  // If neither matches, try Vana session introspection.
  const introspection = await fetch(`${ACCOUNT_URL}/api/oauth/introspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const result = await introspection.json();
  if (result.active === true) {
    if (!result.aud?.includes(deps.serverPublicUrl)) {
      return c.json(
        { error: { code: 401, errorCode: "AUDIENCE_MISMATCH" } },
        401,
      );
    }
    const primaryWallet = result.linked_wallets?.find((w: any) => w.is_primary);
    if (!primaryWallet) {
      return c.json(
        { error: { code: 401, errorCode: "NO_PRIMARY_WALLET" } },
        401,
      );
    }
    c.set("auth", createOwnerSessionAuth(primaryWallet.address));
    c.set("authMechanism", "vana-session");
    c.set("isPolicyBypass", false);
    c.set("devBypass", false);
    await next();
    return;
  }
  // Fall through to web3-signed verification.
}
```

This is the fifth mechanism in `web3-auth.ts`, after dev-token, control-plane-token, cli-session-token, and the existing web3-signed default.

### 9.4 Latency

The introspection round-trip from PS → account.vana.org is one network hop per request. PS could optionally cache `(token → introspection_result)` in-process for 30s, mirroring `getVanaSession`. Defer until measured.

---

## 10. Per-flow migration table

23 authenticated routes group into three PR groups. Each PR ships atomically. **PR-X depends on Stage 5 (signing plane) being done first.**

### 10.1 PR-Y — route auth swap, non-signing

Routes:

- `/api/auth/session` (Privy bridge — stays as the sole `privyClient.users().get()` site).
- `/auth/oidc/login`, `/auth/oidc/consent` (Hydra OIDC handlers — already use Hydra; minimal change).
- `/api/account/access` (8 routes).
- `/api/account/actions` (5 routes).
- `/api/admin/oauth-clients` (POST, GET, DELETE).

Migration:

- Replace existing auth (Privy cookie, master-key-signature, ACCOUNT_LOGIN_SESSION_COOKIE) with `getVanaSession(req)`.
- For routes that previously took `masterKeySignature` in the body: drop the field; recover `vanaUserId` from session.
- `oauth_clients.owner_vana_user_id` populated from session; existing rows backfilled from `oauth_clients.owner_address` via one-shot script (lookup by primary wallet address).
- `oauth_clients.owner_address` column NOT dropped here; follow-up cleanup PR.

### 10.2 PR-X — servers + register-on-chain (atomic with signing)

Routes:

- `/api/servers` (POST, GET).
- `/api/servers/:id` (GET, DELETE).
- `/api/servers/:id/register-on-chain` (POST).

Migration (all in one PR):

1. Server-side route auth swap to `getVanaSession`.
2. `personal_servers.user_id` semantics shift from "lowercased EVM address" to "vana_user_id". One-shot DB script populates from `vana_linked_wallets.is_primary` join.
3. `register-on-chain.ts` internal call swap: from `fetch('/api/sign', {body: {masterKeySignature, typedData}})` to `wallet.signTypedData({purpose: 'register_personal_server', vanaUserId, typedData, confirmationId})`.
4. `register-on-chain` route returns `401 confirmation_required` on first call; client (`use-server.ts`) handles the modal dance.
5. **Client-side `use-server.ts`** explicit changes:
   - Remove `useSignMessage` for `vana-master-key-v1`. No more master-key computation.
   - Remove `masterKeySignature` from request bodies.
   - On `401 confirmation_required` from any /api/servers/\* route: render the global `<ConfirmationModal>` (mounted in app shell, Stage 5.6); on user Confirm, POST `/api/auth/confirmations/:id/consume`; on success, retry with `x-vana-confirmation-id` header.
   - Use `vana_access` cookie value as Bearer for state-mutating requests.

### 10.3 PR-Z — device flow decommission

- Delete legacy `/api/auth/device/route.ts`, `/api/auth/device/poll/route.ts`, `/api/auth/device/approve/route.ts`. These predate Hydra and minted bespoke `vana_sess_*` tokens.
- Delete client code that consumed them.
- Add `/auth/device` UI page (Stage 3.4 already lands this) which uses Hydra's `getDeviceUserCodeRequest` + `acceptUserCodeRequest`.
- Memory App and any other clients that used the legacy device flow are migrated to Hydra device flow as part of this PR.

---

## 11. Provider Containment enforcement

Three layers, defense in depth:

1. **Compile-time:** `VanaUserId` branded type. Every function that takes a user identifier takes `VanaUserId`. Construction requires explicit `assertVanaUserId(...)` at the boundary (DB read, JWT decode, route input). Compiler rejects passing a raw `string` (e.g., a Privy DID) into a `VanaUserId`-typed parameter.

2. **Runtime (dev/staging):** middleware `withProviderContainmentTripwire` that wraps the response writer, scans the body for the regex `/did:privy:|did:para:|did:dynamic:/i`, and if found:
   - Logs a stack trace at the originating call site.
   - Throws a 500 in the response with body `{ error: 'PROVIDER_CONTAINMENT_VIOLATION', match: <substring>, file: <stack> }`.
   - Disabled in production via `NODE_ENV !== 'production'` check.

3. **Code review:** `02-code-review-checklist.md` items:
   - Does any DB column added in this PR contain a Privy DID, Privy walletId, Para user id, or similar? If yes, is it inside `vana_provider_links`, `wallet-providers/*.ts`, or `/api/auth/session`?
   - Does any response payload include a Privy artifact?
   - Are any new identifiers typed as `VanaUserId`, or as raw `string`?

---

## 12. Open questions (must resolve before Stage 2)

Marked with [Q1]–[Q5]. Tim signs off or pushes back.

**[Q1] Opaque vs JWT access tokens.** Plan picks opaque + introspection for revocation guarantees. Latency: ~10ms/request (cached <1ms). Alternative (JWT + JWKS): stateless, sub-millisecond, but no real revocation. Confirm.

**[Q2] TTLs.** Access 15min / Refresh 30d / Tombstone 30min / Confirmation 5min / Authority 60s. Confirm.

**[Q3] Inline modal vs redirect for confirmations.** Plan picks inline modal mounted in app shell. UX concerns:

- Can the user navigate away mid-confirmation? (Yes; closing modal cancels the sign without consuming.)
- Is the payload summary readable on mobile? (Modal is responsive; summary is JSON in a monospace pre block.)
- Should there be a "remind me later" affordance? (Probably not; expires_at is 5min, fresh request issues a new one.)

**[Q4] CSRF: drop entirely (Bearer-only state mutation) vs double-submit cookie+token.** Plan drops; rationale: simpler, no token plane to maintain. The non-HttpOnly `vana_access` cookie is JS-readable; XSS already lets attacker fetch any endpoint with the cookie attached, so CSRF defense is moot. Confirm.

**[Q5] Privy bridge nonce.** Plan defers full nonce; substitute is `aud === PRIVY_APP_ID` + 5min `iat` skew + same-origin HttpOnly `vana_session_begin_cookie` set on `/begin` precursor. Sufficient for single-user dev; revisit when multi-user. Confirm.

---

## Appendix: file layout (Stage 1–6)

```
src/lib/auth/
├── branded-ids.ts                  # Stage 6: VanaUserId brand
├── vana-session.ts                 # Stage 3: getVanaSession verifier
├── signing-purposes.ts             # Stage 5: closed enum + validators
├── wallet.ts                       # Stage 5: signTypedData orchestrator
├── interactive-confirmations.ts    # Stage 5: issue/status/consume
├── payload-hash.ts                 # Stage 5: JCS canonicalize + sha256
├── tripwire.ts                     # Stage 6: did:privy: middleware
└── wallet-providers/
    └── privy.ts                    # Stage 5: Privy custody adapter

src/lib/db/
├── auth-signing.ts                 # Stage 2: signing_authorizations + interactive_confirmations
├── sessions.ts                     # Stage 2: vana_refresh_tokens + vana_session_tombstones
└── account.ts                      # existing; minor sweeps for VanaUserId brand

src/app/api/
├── auth/
│   ├── session/                    # Privy bridge (Stage 3 rewrite)
│   ├── confirmations/[id]/
│   │   ├── consume/route.ts        # Stage 5
│   │   └── status/route.ts         # Stage 5
│   ├── logout/route.ts             # Stage 3
│   └── device/                     # DELETED in PR-Z
├── oauth/
│   └── introspect/route.ts         # Stage 3: PS proxy
└── sign/route.ts                   # DELETED in Stage 5.7

src/app/auth/device/
└── page.tsx                        # Stage 3: Hydra device verification UI

migrations/
└── 008_auth_signing_plane.sql      # Stage 2

docs/auth-redesign/
├── 00-execution-plan.md            # plan (v3)
├── 01-architecture.md              # this doc
├── 02-code-review-checklist.md     # Stage 6
├── 10-runbook.md                   # Stage 8
└── security-debt.md                # already exists
```
