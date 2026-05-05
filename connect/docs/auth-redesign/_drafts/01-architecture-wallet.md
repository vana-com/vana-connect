# 01-architecture-wallet.md — Wallet & Signing API

Status: draft (Stage 1 sub-doc)
Owner: Tim
Author: claude
Last updated: 2026-05-04

Companion to `01-architecture.md` covering execution-plan v3 §1.5, §1.6 in
detail. This document spec's the wallet API surface, the closed `purpose`
enum and per-purpose validators, the `interactive_confirmations` lifecycle,
and the Privy adapter. The Stage 5 implementation lands the contents of this
file as `src/lib/auth/signing-purposes.ts`, `src/lib/auth/wallet.ts`,
`src/lib/auth/wallet-providers/privy.ts`, and
`src/lib/auth/interactive-confirmations.ts`.

Two invariants govern this layer (see `00-execution-plan.md` §1.1):

- **Signing Authority Invariant (SAI):** every server-side signature on a
  user's wallet requires a fresh, single-use, payload-bound
  `signing_authorizations` row issued at the call site. High-risk purposes
  additionally require an `interactive_confirmations` row whose
  `payload_hash` matches the authority's. No auto-issuance, ever.
- **Provider Containment Invariant (PCI):** Privy DIDs and other provider
  identifiers do not leak past the adapter boundary. The wallet API speaks
  in `VanaUserId` and `VanaWalletId`.

---

## 1. The closed `purpose` enum

```ts
// src/lib/auth/signing-purposes.ts

export type Purpose =
  | "register_personal_server"
  | "register_personal_server_deregistration"
  | "create_grant"
  | "revoke_grant";

export const HIGH_RISK_PURPOSES: ReadonlySet<Purpose> = new Set([
  "register_personal_server",
  "register_personal_server_deregistration",
  "create_grant",
  "revoke_grant",
]);
// `register_builder` is NOT here — server-EOA, separate identity. See §6.
```

In v3 **all four purposes are HIGH_RISK** (Tim's call: no auto-issuance,
payload-bound, single-use, with a confirmation in front). `revoke_grant` is
listed as high-risk too because (a) a stolen access token revoking a user's
grants is a denial-of-service vector, and (b) the cost of one extra modal
click for the user is far less than the cost of being wrong.

### 1.1 Domains

All four purposes share the gateway's EIP-712 domain (already canonical in
`src/lib/server-provider/register-on-chain.ts:20-28` and
`src/app/admin/_lib/register-builder.ts:11-16`):

```ts
export const VANA_DATA_PORTABILITY_DOMAIN = {
  name: "Vana Data Portability",
  version: "1",
  chainId: BigInt(
    process.env.NEXT_PUBLIC_VANA_CHAIN_ID ?? process.env.VANA_CHAIN_ID ?? 1480,
  ),
  verifyingContract: (process.env.DATA_PORTABILITY_SERVER_CONTRACT ??
    "0x0000000000000000000000000000000000000000") as Address,
} as const;
```

The validator in §3 asserts every typed-data submission's `domain` exactly
equals this object (after `BigInt`-vs-string normalization). Any mismatch
fails closed.

### 1.2 Per-purpose schema and metadata

| Purpose                                   | `primaryType`          | Message fields                                                             | Summary fields rendered                   |
| ----------------------------------------- | ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| `register_personal_server`                | `ServerRegistration`   | `ownerAddress`, `serverAddress`, `publicKey`, `serverUrl`                  | action, server_url, owner, server_address |
| `register_personal_server_deregistration` | `ServerDeregistration` | `ownerAddress`, `serverAddress`, `serverUrl`                               | action, server_url, owner, server_address |
| `create_grant`                            | `GrantRegistration`    | `ownerAddress`, `granteeAddress`, `grantId`, `scope`, `expiresAt`, `nonce` | action, app, owner, scope, expires        |
| `revoke_grant`                            | `GrantRevocation`      | `ownerAddress`, `granteeAddress`, `grantId`, `nonce`                       | action, app, grant_id                     |

`ServerRegistration` types match the existing definition in
`register-on-chain.ts:30-37`. `ServerDeregistration` mirrors it without
`publicKey`. `GrantRegistration` / `GrantRevocation` types are the gateway
contracts the PS already signs on the user's behalf today
(`packages/server/src/lib/eip712.ts` in personal-server-ts) — bringing them
behind `wallet.signTypedData` is the substance of `create_grant` /
`revoke_grant`.

### 1.3 Per-purpose validation rules

- **`register_personal_server`:**
  - `message.serverUrl` matches `/^https:\/\/0x[0-9a-f]{40}\.myvana\.app$/`
    (the canonical Vana-hosted PS hostname).
  - `message.ownerAddress` is a checksummed `0x[0-9a-fA-F]{40}`.
  - `message.serverAddress` is a checksummed address; **must equal** the
    20-byte address embedded in `serverUrl`'s subdomain (case-insensitive).
    This binding catches a swapped-server attack at signing time.
  - `message.publicKey` is `0x04…` (uncompressed secp256k1, 130 hex chars
    after `0x`).

- **`register_personal_server_deregistration`:** same shape as above
  without `publicKey`. Same hostname/address binding.

- **`create_grant`:**
  - `message.scope` is a non-empty string array of known scopes (validated
    against the runtime `KNOWN_SCOPES` set; unknown scope = reject).
  - `message.expiresAt` is a uint64 ≤ `now() + 90 days` and ≥ `now() + 5
minutes`. Past- or far-future-dated grants are rejected at the wallet
    layer to bound damage.
  - `message.nonce` is uint256, non-zero.
  - `message.grantId` is a 0x-prefixed 32-byte hex.

- **`revoke_grant`:** same `granteeAddress` / `grantId` / `nonce` shape;
  no `expiresAt`. `grantId` must reference an existing live grant for
  `ownerAddress` (DB lookup; reject if absent).

All validators are total: they look at every field in `typedData.message`
and refuse if there are extras the validator doesn't understand. This is
the property test from §4 — every field must end up in the summary, or the
validator fails closed.

---

## 2. `wallet.signTypedData` API

```ts
// src/lib/auth/wallet.ts

import type { Hex, TypedDataDefinition } from "viem";
import type { VanaUserId } from "@/lib/auth/branded-ids";

export type VanaWalletId = string & { readonly __brand: "VanaWalletId" };

export type SignTypedDataInput = {
  vanaUserId: VanaUserId;
  vanaWalletId?: VanaWalletId; // defaults to is_primary
  purpose: Purpose;
  typedData: TypedDataDefinition;
  confirmationEventId?: string; // server-issued, single-use
};

export type SignTypedDataResult =
  | { kind: "signature"; signature: Hex; authorizationId: string }
  | {
      kind: "requires_confirmation";
      confirmationId: string;
      confirmationUrl: string; // absolute https URL for shell-open
      statusUrl: string; // absolute https URL for polling
      payloadSummary: Record<string, unknown>;
      expiresAt: string; // ISO-8601
    }
  | { kind: "not_supported_yet"; reason: "user_controlled_eoa" };

export async function signTypedData(
  input: SignTypedDataInput,
): Promise<SignTypedDataResult>;
```

### 2.1 Algorithm

1. **Validate purpose.** `Object.values(Purpose).includes(input.purpose)`.
   Reject otherwise. (TS narrows but the runtime check is the boundary
   guard for body-deserialized values.)

2. **Run per-purpose validator** (§3) on `input.typedData`. On failure,
   throw `WalletValidationError(reason)`. The route handler maps this to
   400 — it is a programmer error, not a security event, and surfacing
   `reason` is safe.

3. **Resolve the wallet.**

   ```ts
   const wallet = input.vanaWalletId
     ? await db.vanaLinkedWallets.byId(input.vanaWalletId)
     : await db.vanaLinkedWallets.primaryFor(input.vanaUserId);
   ```

   If no row matches: return `{ kind: 'not_supported_yet', reason:
'user_controlled_eoa' }`. **Important:** identical shape regardless of
   "no wallet at all" vs "wallet is user_controlled_eoa" vs "feature
   off." This is the round-1 #3 fix — no oracle on user state.

4. **Branch on `key_control_type`:**
   - `user_controlled_eoa` or `smart_account`: return `{ kind:
'not_supported_yet', reason: 'user_controlled_eoa' }`.
   - `provider_embedded`: continue.

5. **Compute `payload_hash`.**

   ```ts
   const canonical = canonicalize(input.typedData); // RFC-8785-style
   const payload_hash = sha256Hex(canonical);
   ```

   `canonicalize` is the deterministic JSON canonicalizer used in §1.6. The
   summary template (§4) MUST consume the same `canonical` representation
   so the summary can never disagree with the hash.

6. **Confirmation gate.** Because all four purposes are HIGH_RISK:

   ```ts
   if (input.confirmationEventId) {
     const consumed = await consumeInteractiveConfirmation({
       id: input.confirmationEventId,
       expectedPayloadHash: payload_hash,
       expectedHydraSessionId: ctx.hydraSessionId,
       expectedVanaUserId: input.vanaUserId,
       expectedPurpose: input.purpose,
     });
     if (!consumed.ok) {
       // expired, mismatched, already-consumed, foreign session → freshly
       // issue a new confirmation row and return requires_confirmation.
       return await issueAndReturnRequiresConfirmation();
     }
     // proceed; consumed.row is the matched, freshly-consumed row.
   } else {
     return await issueAndReturnRequiresConfirmation();
   }
   ```

   The route handler returns 401 with the `requires_confirmation` envelope
   verbatim (see §8). `issueAndReturnRequiresConfirmation` writes a fresh
   `interactive_confirmations` row with `payload_hash`, `payload_summary`,
   `expires_at = now() + 5min`.

7. **Single transaction.** Wraps the authority-row insert, the consume
   update, the Privy SDK call, and the result-cache update:

   ```ts
   await db.transaction(async (tx) => {
     // a. INSERT signing_authorizations (max_uses=1, expires_at=now()+60s)
     const authority = await tx.signingAuthorizations.insert({
       id: `vana_auth_${randomBytes(16).toString("hex")}`,
       vana_user_id: input.vanaUserId,
       vana_wallet_id: wallet.id,
       hydra_session_id: ctx.hydraSessionId,
       purpose: input.purpose,
       payload_hash,
       payload_summary: summaryFor(input.purpose, input.typedData),
       confirmation_id: consumed.row.id,
       max_uses: 1,
       used_count: 0,
       expires_at: nowPlus(60_000),
     });
     // The partial UNIQUE on (payload_hash) WHERE consumed_at IS NULL
     // surfaces here as a constraint error. If it fires, abort:
     // some other request raced us to mint an authority for the same
     // payload. The other request will succeed; this one returns 409
     // upstream.

     // b. Atomic consume.
     const claimed = await tx.signingAuthorizations.consume({
       id: authority.id,
     });
     if (!claimed) {
       throw new ConcurrentConsumeError(); // partial unique index hit
     }

     // c. Provider call.
     const signature = await walletProvider.signTypedData({
       vanaWalletId: wallet.id,
       providerWalletId: wallet.provider_wallet_id,
       typedData: input.typedData,
     });

     // d. Cache the result on the confirmation row for 30s replay grace.
     await tx.interactiveConfirmations.setConsumedResult({
       id: consumed.row.id,
       result: { signature, authorizationId: authority.id },
       gracePeriodMs: 30_000,
     });

     return { signature, authorityId: authority.id };
   });
   ```

8. **Return** `{ kind: 'signature', signature, authorizationId }`.

### 2.2 Failure modes

- **Privy SDK throws.** DB transaction rolls back. No authority leaks (no
  row with `consumed_at` set without a returned signature). Confirmation
  row remains consumed; the route returns 502 and the client may retry —
  the retry hits the 30s grace cache (§7) but, since
  `consumed_result` was never written, replays as `gone` and forces a
  fresh confirmation.

- **Confirmation expired between step 6 and step 7.** The partial UNIQUE
  on `payload_hash` plus the `expires_at > now()` predicate on the
  consume update fail closed. No authority row, no signature.

- **Replay within 30s grace.** The route handler (§8) checks
  `interactive_confirmations.consumed_result` first; if present and
  within grace, returns it as `{ kind: 'signature', ... }` without
  re-entering `wallet.signTypedData`. This is route-level, not
  wallet-level — the wallet API itself is single-use.

- **Replay past 30s grace.** Confirmation row is `consumed_at IS NOT
NULL` and grace expired → `consumeInteractiveConfirmation` returns
  `{ ok: false, reason: 'consumed' }`, route returns 410.

---

## 3. Per-purpose validators

```ts
// src/lib/auth/signing-purposes.ts (continued)

import { isAddress, getAddress } from "viem";

type RegisterPersonalServerTypedData = {
  domain: typeof VANA_DATA_PORTABILITY_DOMAIN;
  primaryType: "ServerRegistration";
  types: { ServerRegistration: typeof SERVER_REGISTRATION_TYPES };
  message: {
    ownerAddress: `0x${string}`;
    serverAddress: `0x${string}`;
    publicKey: `0x${string}`;
    serverUrl: string;
  };
};

const PS_HOSTNAME_RE = /^https:\/\/(0x[0-9a-f]{40})\.myvana\.app$/;

export function validateRegisterPersonalServer(
  td: unknown,
): asserts td is RegisterPersonalServerTypedData {
  assertDomain(td);
  assertPrimaryType(td, "ServerRegistration");
  assertTypesShape(td, SERVER_REGISTRATION_TYPES);
  const m = (td as any).message;
  assertExactKeys(m, [
    "ownerAddress",
    "serverAddress",
    "publicKey",
    "serverUrl",
  ]);
  if (!isAddress(m.ownerAddress)) throw fail("ownerAddress");
  if (!isAddress(m.serverAddress)) throw fail("serverAddress");
  if (!/^0x04[0-9a-fA-F]{128}$/.test(m.publicKey)) throw fail("publicKey");
  const match = PS_HOSTNAME_RE.exec(m.serverUrl);
  if (!match) throw fail("serverUrl pattern");
  if (getAddress(match[1]) !== getAddress(m.serverAddress)) {
    throw fail("serverUrl/serverAddress binding");
  }
}

export function validateRegisterPersonalServerDeregistration(
  td: unknown,
): asserts td is RegisterPersonalServerDeregistrationTypedData {
  assertDomain(td);
  assertPrimaryType(td, "ServerDeregistration");
  assertTypesShape(td, SERVER_DEREGISTRATION_TYPES);
  const m = (td as any).message;
  assertExactKeys(m, ["ownerAddress", "serverAddress", "serverUrl"]);
  if (!isAddress(m.ownerAddress)) throw fail("ownerAddress");
  if (!isAddress(m.serverAddress)) throw fail("serverAddress");
  const match = PS_HOSTNAME_RE.exec(m.serverUrl);
  if (!match) throw fail("serverUrl pattern");
  if (getAddress(match[1]) !== getAddress(m.serverAddress)) {
    throw fail("serverUrl/serverAddress binding");
  }
}

const FIVE_MINUTES = 5 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

export function validateCreateGrant(
  td: unknown,
): asserts td is CreateGrantTypedData {
  assertDomain(td);
  assertPrimaryType(td, "GrantRegistration");
  assertTypesShape(td, GRANT_REGISTRATION_TYPES);
  const m = (td as any).message;
  assertExactKeys(m, [
    "ownerAddress",
    "granteeAddress",
    "grantId",
    "scope",
    "expiresAt",
    "nonce",
  ]);
  if (!isAddress(m.ownerAddress)) throw fail("ownerAddress");
  if (!isAddress(m.granteeAddress)) throw fail("granteeAddress");
  if (!/^0x[0-9a-fA-F]{64}$/.test(m.grantId)) throw fail("grantId");
  if (!Array.isArray(m.scope) || m.scope.length === 0) throw fail("scope");
  for (const s of m.scope) {
    if (typeof s !== "string" || !KNOWN_SCOPES.has(s)) throw fail(`scope:${s}`);
  }
  const expiresAtMs = Number(m.expiresAt) * 1000;
  if (!Number.isFinite(expiresAtMs)) throw fail("expiresAt");
  const now = Date.now();
  if (expiresAtMs < now + FIVE_MINUTES) throw fail("expiresAt too soon");
  if (expiresAtMs > now + NINETY_DAYS) throw fail("expiresAt too far");
  if (
    typeof m.nonce !== "string" ||
    !/^[0-9]+$/.test(m.nonce) ||
    m.nonce === "0"
  )
    throw fail("nonce");
}

export function validateRevokeGrant(
  td: unknown,
): asserts td is RevokeGrantTypedData {
  assertDomain(td);
  assertPrimaryType(td, "GrantRevocation");
  assertTypesShape(td, GRANT_REVOCATION_TYPES);
  const m = (td as any).message;
  assertExactKeys(m, ["ownerAddress", "granteeAddress", "grantId", "nonce"]);
  if (!isAddress(m.ownerAddress)) throw fail("ownerAddress");
  if (!isAddress(m.granteeAddress)) throw fail("granteeAddress");
  if (!/^0x[0-9a-fA-F]{64}$/.test(m.grantId)) throw fail("grantId");
  if (
    typeof m.nonce !== "string" ||
    !/^[0-9]+$/.test(m.nonce) ||
    m.nonce === "0"
  )
    throw fail("nonce");
}

export const validators: Record<Purpose, (td: unknown) => void> = {
  register_personal_server: validateRegisterPersonalServer,
  register_personal_server_deregistration:
    validateRegisterPersonalServerDeregistration,
  create_grant: validateCreateGrant,
  revoke_grant: validateRevokeGrant,
};
```

`assertExactKeys(obj, keys)` asserts both inclusion and exclusion — extra
fields are a validation failure. This is what couples the validator to the
summary template (§4): a field that the validator doesn't know about is
also a field the user wouldn't see in the summary, so we refuse to sign it.

The current `sign-validation.ts:1-41` (allowlist of `primaryType`) is
strictly weaker — it accepts any message shape so long as the type name
matches. The new validators replace it.

---

## 4. Summary templates

```ts
// src/lib/auth/signing-purposes.ts (continued)

export function summaryFor(
  purpose: Purpose,
  td: TypedDataDefinition,
): Record<string, unknown> {
  switch (purpose) {
    case "register_personal_server":
      return summarizeRegisterPersonalServer(td as any);
    case "register_personal_server_deregistration":
      return summarizeRegisterPersonalServerDeregistration(td as any);
    case "create_grant":
      return summarizeCreateGrant(td as any);
    case "revoke_grant":
      return summarizeRevokeGrant(td as any);
  }
}

function summarizeRegisterPersonalServer(td: RegisterPersonalServerTypedData) {
  return {
    action: "Register Personal Server",
    server_url: td.message.serverUrl,
    owner: td.message.ownerAddress,
    server_address: td.message.serverAddress,
    // publicKey omitted from summary — but covered by the property test
    // because the validator binds publicKey to a fixed shape and the
    // template explicitly opts out via the SUMMARY_OMIT_FIELDS set.
  };
}

function summarizeRegisterPersonalServerDeregistration(
  td: RegisterPersonalServerDeregistrationTypedData,
) {
  return {
    action: "Deregister Personal Server",
    server_url: td.message.serverUrl,
    owner: td.message.ownerAddress,
    server_address: td.message.serverAddress,
  };
}

function summarizeCreateGrant(td: CreateGrantTypedData) {
  return {
    action: "Create Grant",
    app: td.message.granteeAddress,
    owner: td.message.ownerAddress,
    grant_id: td.message.grantId,
    scope: td.message.scope,
    expires: new Date(Number(td.message.expiresAt) * 1000).toISOString(),
    // nonce omitted — opaque replay-prevention value, not user-meaningful.
  };
}

function summarizeRevokeGrant(td: RevokeGrantTypedData) {
  return {
    action: "Revoke Grant",
    app: td.message.granteeAddress,
    grant_id: td.message.grantId,
    // ownerAddress and nonce omitted; the user is implicitly the owner.
  };
}

// The opt-out set, used by the property test. Any field not in the summary
// must be in this set, otherwise the test fails the build.
export const SUMMARY_OMIT_FIELDS: Record<Purpose, ReadonlySet<string>> = {
  register_personal_server: new Set(["publicKey"]),
  register_personal_server_deregistration: new Set(),
  create_grant: new Set(["nonce"]),
  revoke_grant: new Set(["ownerAddress", "nonce"]),
};
```

### 4.1 Property-test invariant

```ts
// src/lib/auth/signing-purposes.test.ts

test.each(Object.values(Purpose))(
  "every typed-data field appears in summary or is explicitly omitted (%s)",
  (purpose) => {
    const sample = sampleTypedData[purpose];
    const summary = summaryFor(purpose, sample);
    const messageKeys = new Set(Object.keys(sample.message));
    const summaryValues = JSON.stringify(summary);

    for (const key of messageKeys) {
      const inSummary =
        summaryValues.includes(String(sample.message[key])) ||
        SUMMARY_OMIT_FIELDS[purpose].has(key);
      expect(inSummary).toBe(true);
    }
  },
);
```

The test guards against a future PR adding a field to a typed-data schema
without updating the summary or the explicit opt-out set. It's the
mechanical fix for round-2 audit finding (a) — summary tampering by
omission. The validator's `assertExactKeys` is the runtime guard for the
same property; the property test is the build-time guard.

---

## 5. The Privy adapter

`src/lib/auth/wallet-providers/privy.ts` — the **only** file outside
`/api/auth/session` that imports `@privy-io/node` for signing.

```ts
import { PrivyClient } from "@privy-io/node";
import type { Hex, TypedDataDefinition } from "viem";
import type { VanaWalletId } from "@/lib/auth/wallet";

export interface WalletProvider {
  signTypedData(input: {
    vanaWalletId: VanaWalletId;
    providerWalletId: string;
    typedData: TypedDataDefinition;
  }): Promise<Hex>;
}

let _client: PrivyClient | null = null;
function getPrivyClient(): PrivyClient {
  if (!_client) {
    _client = new PrivyClient({
      appId: requireEnv("PRIVY_APP_ID"),
      appSecret: requireEnv("PRIVY_APP_SECRET"),
    });
  }
  return _client;
}

export const privyProvider: WalletProvider = {
  async signTypedData(input) {
    const privy = getPrivyClient();
    const result = await privy
      .wallets()
      .ethereum()
      .signTypedData(input.providerWalletId, {
        params: { typed_data: input.typedData },
        authorization_context: {
          authorization_private_keys: [requireEnv("PRIVY_SIGNER_PRIVATE_KEY")],
        },
      });
    return result.signature as Hex;
  },
};
```

### 5.1 Provider dispatch

`wallet.signTypedData` (§2) reads
`vana_linked_wallets[vanaWalletId].provider`:

```ts
function providerFor(provider: string): WalletProvider {
  switch (provider) {
    case "privy":
      return privyProvider;
    // case 'para': return paraProvider;     // future
    // case 'dynamic': return dynamicProvider; // future
    default:
      throw new Error(`Unknown wallet provider: ${provider}`);
  }
}
```

Future providers each get their own adapter file under
`src/lib/auth/wallet-providers/`. None of them import each other; the
dispatch is the only place that knows about the set.

### 5.2 PCI compliance

The adapter takes `providerWalletId: string` (an opaque Privy wallet id)
and returns a `Hex` signature. Privy DIDs (`did:privy:…`) and the embedded
wallet id never appear above this line. The route handler and the wallet
API speak in `VanaWalletId`, the brand for `vana_linked_wallets.id`. The
mapping `VanaWalletId → providerWalletId` happens inside step 7c of §2.1
and is colocated with the Privy SDK call.

---

## 6. The `register_builder` exception

`src/app/admin/_lib/register-builder.ts` is **not** in scope for the
purpose enum. Reasoning:

- It signs as a server-generated EOA — a freshly minted private key per
  registration (`generatePrivateKey()` at line 69), used once, then
  optionally persisted as the builder's identity. The signer is not the
  user; it is the builder app itself.
- There is no user wallet to custody. The registered EOA is the
  builder's identity; the user wallet is uninvolved.
- The existing pattern in `register-builder.ts` is fine for what it
  does: build the EIP-712, sign with `viem`'s in-process key, POST to
  `/v1/builders`. No Privy round trip.

Action items:

1. Add a code comment at the top of `register-builder.ts` linking to this
   document section so future readers understand why this path is
   exempt:

   ```ts
   /**
    * NOT a `wallet.signTypedData` purpose. See
    * docs/auth-redesign/_drafts/01-architecture-wallet.md §6.
    *
    * BuilderRegistration signs as the builder's own server-generated
    * EOA, not as a user-custodied wallet. The signing-authority plane
    * does not gate this — there is no user authority to gate.
    */
   ```

2. Track in `security-debt.md`: the server holds a builder private key
   in memory after `generatePrivateKey()`. There is no rotation,
   audit log, or hardware-backed storage. This is the same KEK-leak
   concern as `PRIVY_SIGNER_PRIVATE_KEY`, scoped to a single builder.
   Acceptable because builder identity != user identity, but worth
   tracking.

---

## 7. The `interactive_confirmations` lifecycle

### 7.1 Issuance

Triggered when `wallet.signTypedData` (§2 step 6) detects a HIGH_RISK
purpose with a missing or invalid `confirmationEventId`.

```ts
async function issueAndReturnRequiresConfirmation(): Promise<SignTypedDataResult> {
  const id = `vana_conf_${randomBytes(16).toString("hex")}`;
  const summary = summaryFor(input.purpose, input.typedData);
  await db.interactiveConfirmations.insert({
    id,
    vana_user_id: input.vanaUserId,
    vana_wallet_id: wallet.id,
    purpose: input.purpose,
    payload_hash,
    payload_summary: summary,
    expires_at: nowPlus(5 * 60_000),
    hydra_session_id: ctx.hydraSessionId,
  });
  const baseUrl = requireEnv("ACCOUNT_PUBLIC_URL"); // https://account.vana.org
  return {
    kind: "requires_confirmation",
    confirmationId: id,
    confirmationUrl: `${baseUrl}/confirm/${id}`,
    statusUrl: `${baseUrl}/api/auth/confirmations/${id}/status`,
    payloadSummary: summary,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}
```

The route handler maps this result to `401` with the envelope as the JSON
body. 5-minute TTL — long enough that a careful user reading the summary
isn't punished, short enough that a stolen confirmation has bounded
lifetime. (This is the round-2 audit B.1.2 fix: the 60s TTL belongs to the
resulting authority, not the confirmation.)

### 7.2 Confirmation — browser, inline modal

1. `useServer` (and other client hooks that drive HIGH_RISK purposes)
   catch the 401 envelope and pass it to the inline modal mounted in the
   app shell (`src/app/_components/confirmation-modal.tsx`, added in
   Stage 5.6).
2. Modal renders `payload_summary` as a definition list; reuses
   `DetailRow` from `account/actions/[id]/page-client.tsx:297-323`.
3. On Confirm: `POST /api/auth/confirmations/:id/confirm` (Bearer-only,
   per the v3 state-mutating-routes-take-Bearer rule).
4. Route handler:

   ```ts
   const session = await getVanaSession(req);
   if (!session) return 401;
   const updated = await db.execute(`
     UPDATE interactive_confirmations
     SET consumed_at = now()
     WHERE id = $1
       AND consumed_at IS NULL
       AND expires_at > now()
       AND hydra_session_id = $2
       AND vana_user_id = $3
     RETURNING id
   `, [id, session.hydraSessionId, session.vanaUserId]);
   if (updated.rowCount === 0) return 409 // gone or foreign-session
   return 200 { ok: true };
   ```

5. Client retries the original `wallet.signTypedData`-driving request
   with `x-vana-confirmation-id: <id>` header.

### 7.3 Confirmation — Tauri, shell-open + poll

1. Tauri receives the 401 envelope from account.vana.org. Body includes
   `confirmationUrl` and `statusUrl` (absolute https).
2. Tauri calls `shell.open(confirmationUrl)`. The default browser opens
   `https://account.vana.org/confirm/:id`, which is a Next.js page that
   reads the row by id, renders the same modal layout (full page), and
   POSTs `/confirm` on Confirm.
3. Tauri concurrently polls `GET ${statusUrl}` every 2 seconds. Response
   shape:

   ```json
   { "status": "pending" | "confirmed" | "expired" }
   ```

   The status route is **not** Bearer-protected — it discloses only
   whether _that confirmation_ is consumed; no user data, no payload.
   Rate-limited to 10 req/min/IP.

4. On `confirmed`, Tauri retries the original signing op with
   `x-vana-confirmation-id`. On `expired`, Tauri surfaces the error and
   the user re-initiates (which will issue a fresh confirmation).

### 7.4 Idempotency — 30-second grace replay

The original route (e.g., `POST /api/servers/:id/register-on-chain`)
completes by either returning a fresh `signTypedData` result or by
catching `ConcurrentConsumeError` from §2.1 step 7. On success, the route
caches the response on the confirmation row (§2.1 step 7d).

On retry within 30s of `consumed_at`:

```ts
async function POST(req) {
  const id = req.headers.get("x-vana-confirmation-id");
  const cached = id ? await getCachedConfirmationResult(id) : null;
  if (cached?.withinGrace) {
    return NextResponse.json(cached.result);
  }
  // …else proceed with normal wallet.signTypedData
}
```

`getCachedConfirmationResult` reads `interactive_confirmations.consumed_at`
and `consumed_result`; if `consumed_at` is within 30s and
`consumed_result IS NOT NULL`, returns the cached payload. Past 30s, or
without a cached result, the call falls through and the wallet API
returns `requires_confirmation` (since the row is consumed, the consume
step in §2.1 step 6 fails).

### 7.5 Property-test invariants

```ts
// 1. Per-payload keying (round-2 audit B.1.4).
test("two simultaneous register_personal_server with different serverUrls produce two confirmations", async () => {
  const [a, b] = await Promise.all([
    wallet.signTypedData({
      purpose: "register_personal_server",
      typedData: tdA /*…*/,
    }),
    wallet.signTypedData({
      purpose: "register_personal_server",
      typedData: tdB /*…*/,
    }),
  ]);
  expect(a.kind).toBe("requires_confirmation");
  expect(b.kind).toBe("requires_confirmation");
  expect(a.confirmationId).not.toBe(b.confirmationId);
});

// 2. Cross-session replay rejected.
test("confirmation issued in session A cannot be consumed by session B", async () => {
  const issued = await asUser(sessionA).signTypedData(/*…*/);
  await asUser(sessionA).confirmConfirmation(issued.confirmationId);
  const result = await asUser(sessionB).retryWithConfirmation(
    issued.confirmationId,
  );
  expect(result.status).toBe(409);
});

// 3. Modify-after-confirm rejected.
test("changing typedData between confirm and retry is rejected via payload_hash", async () => {
  const issued = await wallet.signTypedData({ typedData: td /*…*/ });
  await confirm(issued.confirmationId);
  const tampered = {
    ...td,
    message: { ...td.message, serverUrl: "https://other.myvana.app" },
  };
  const replayed = await wallet.signTypedData({
    typedData: tampered,
    confirmationEventId: issued.confirmationId /*…*/,
  });
  expect(replayed.kind).toBe("requires_confirmation"); // hash mismatch → fresh confirmation issued
});
```

---

## 8. Routes added / removed in Stage 5

| Method   | Path                                  | Auth                          | Purpose                                                                              |
| -------- | ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `POST`   | `/api/auth/confirmations/:id/confirm` | Bearer                        | User clicks Confirm in the modal/page                                                |
| `GET`    | `/api/auth/confirmations/:id/status`  | none (rate-limited)           | Tauri polling                                                                        |
| `GET`    | `/confirm/:id`                        | session cookie ok (read-only) | Next.js page rendering the modal layout for shell-open clients                       |
| —        | `wallet.signTypedData`                | —                             | Internal API; not a route                                                            |
| `DELETE` | `/api/sign`                           | —                             | **Deleted in Stage 5.** Last caller (`register-on-chain.ts:148`) is migrated in PR-X |

The legacy `/api/sign` route (`src/app/api/sign/route.ts`) is removed
wholesale. Its callers (just `register-on-chain.ts` after PR-X) migrate to
`wallet.signTypedData`. The route's CORS wildcard
(`route.ts:25-29`) goes with it — no public signing endpoint replaces it.

---

## 9. Citations

- `src/app/api/sign/route.ts:1-123` — the route this design replaces.
- `src/app/api/sign/sign-validation.ts:1-41` — the allowlist this design's
  validators (§3) supersede.
- `src/lib/server-provider/register-on-chain.ts:20-37, 116-185` — domain,
  types, and existing call site for the new `wallet.signTypedData`.
- `src/app/admin/_lib/register-builder.ts:11-87` — the
  `register_builder` exception in §6.
- `src/app/account/actions/[id]/page-client.tsx:1-323` — the existing
  approval/decision UX, which the inline confirmation modal in §7.2
  borrows layout from.
- `docs/auth-redesign/00-execution-plan.md` v3 §1.5, §1.6 — the source of
  truth this document expands.
- `docs/auth-redesign/00-execution-plan-security-audit-v2.md` finding (a)
  — closed by §4.1's property test and §3's `assertExactKeys`.
- `docs/auth-redesign/_drafts/auth-redesign-critique-v2.md` (round-2)
  B.1, B.2 — closed by §7.3 (Tauri lifecycle), §7.4 (idempotency), §7.1
  (5-min TTL), and §7.5 (per-payload keying).
