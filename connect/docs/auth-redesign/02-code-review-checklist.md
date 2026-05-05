# Auth Redesign — Code Review Checklist

Run through this for any PR that touches auth, signing, sessions, OAuth
clients, or wallet operations. Each item maps to a specific invariant in
`01-architecture.md`. PCI = Provider Containment Invariant; SAI = Signing
Authority Invariant.

## Provider Containment (PCI)

- [ ] **No provider DID in business identifiers.** The PR does NOT
      introduce a column, response field, log line, OIDC subject, grant
      payload, or per-request path that contains `did:privy:*`,
      `did:para:*`, Privy walletId, or Para userId.
- [ ] **Provider SDKs imported only from whitelisted boundaries.** Search
      the PR diff for `@privy-io/node`, `@privy-io/react-auth`, `@para`,
      `@dynamic-labs`. If found outside `src/lib/auth/wallet-providers/*`,
      `src/app/api/auth/session/`, or test files, that's a violation.
- [ ] **`VanaUserId` is a brand, not a string.** Any new function that
      takes a user identifier takes `VanaUserId`, not `string`. New DB row
      types use `VanaUserId` for user-id fields.
- [ ] **Tripwire passes in dev/staging.** A response body containing
      `did:privy:*` would already fail the tripwire; if the PR disables or
      bypasses it, that's a violation.

## Signing Authority (SAI)

- [ ] **No `Privy.signTypedData` call outside the adapter.** Server-side
      signing goes through `wallet.signTypedData(...)`. The orchestrator is
      the only caller of the adapter.
- [ ] **No `master-key-signature` recovery.** Any code that does
      `recoverAddress({ message: 'vana-master-key-v1', signature })` is the
      legacy pattern; it should not appear in new routes.
- [ ] **High-risk purposes require a confirmation.** `register_personal_
server`, `register_personal_server_deregistration`, and `create_grant`
      always go through `interactive_confirmations` first. The route returns
      `401 confirmation_required` on the first call.
- [ ] **Authority insert + sign + consume happen in the same transaction.**
      No code path inserts an authority, calls Privy, then commits in
      separate transactions.
- [ ] **`signature_hex` is stored on consume.** Anyone calling
      `consumeSigningAuthorization(id)` without passing the signature will
      fail TS compilation; this checks against an accidental rollback to
      the older signature.
- [ ] **Idempotent retry returns the cached signature.** Routes that
      retry with a known `confirmation_id` after a network blip do NOT
      re-mint authority/signature; they look up the consumed authority and
      reuse its `signature_hex`.

## Vana session

- [ ] **Routes use `getVanaSession(req)`.** No hand-rolled cookie reads,
      no Privy verification in route handlers, no master-key recovery for
      authentication.
- [ ] **State-mutating routes accept Bearer only.** POST/PUT/PATCH/DELETE
      do NOT honor `vana_session` cookie alone. The verifier returns null
      when only a cookie is present on a state-mutating method.
- [ ] **Logout writes the tombstone first.** Any change to the logout
      sequence preserves the fail-closed ordering: tombstone → cookie clear
      → best-effort Hydra calls.
- [ ] **No raw refresh token in DB or logs.** Refresh tokens are stored
      via `insertRefreshToken` (AES-256-GCM, KEK from `REFRESH_TOKEN_ENC_KEY`).
      Plaintext `ory_rt_*` only appears in transit between client/Hydra and
      encrypt/decrypt boundaries.

## Schema

- [ ] **Migrations are forward-only.** The PR does not modify a previous
      migration's SQL. New constraints/columns go in a new migration file.
- [ ] **Provider IDs in new tables.** Allowed in: `vana_provider_links`,
      the wallet-providers adapter implementations, the
      `embedded_wallet_custody` table (when introduced). Not allowed
      anywhere else.
- [ ] **New tables have row-level test coverage.** Atomic invariants
      (single-statement updates, partial UNIQUE) are exercised by tests
      under `src/lib/db/*.test.ts`.

## OAuth & Hydra

- [ ] **`access_token_strategy: opaque`** for all clients (we use
      introspection-based revocation). JWT mode requires architecture
      amendment.
- [ ] **Audience matches.** New Hydra clients set `audience: ['account.
vana.org']` by default; non-default audiences (e.g., a PS URL) are
      documented and tested.
- [ ] **`sub = vana_user_id`.** Any new Hydra client config with custom
      subject derivation needs explicit architecture sign-off.

## Tests

- [ ] **New SAI/PCI invariants have explicit unit tests.** A new
      validator has at least one test that asserts the typed-data shape and
      one that asserts summary completeness (every typed-data field appears
      in summary).
- [ ] **Negative paths are covered.** Tests exist for: missing/invalid
      confirmation, expired authority, concurrent UNIQUE race, provider
      failure rollback.
