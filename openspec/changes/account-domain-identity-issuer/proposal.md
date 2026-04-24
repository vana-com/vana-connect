## Why

`account.vana.org` already owns the web login, DataConnect handoff, device-code approval, and Privy-backed signing surfaces, but it does not yet issue provider-agnostic Vana identity credentials for mobile, DataConnect, Context Gateway, or builder-facing APIs.

The protocol-powered mobile baseline needs this account-domain boundary before auth implementation agents can safely replace demo auth: provider proof should enter at `account.vana.org`, and downstream services should verify Vana-issued wallet-rooted credentials instead of Oko, Privy, Para, email, phone, or app-session identifiers.

## What Changes

- Add an account-domain identity issuer contract to the `connect` Next.js app.
- Define challenge and token-exchange APIs that resolve a user to a wallet address and issue Vana-controlled credentials.
- Define a JWKS endpoint and token verification contract for downstream services.
- Introduce provider verifier adapters so the first implementation can support the current Privy account surface and a future Oko-backed mobile flow without changing downstream identity semantics.
- Define persistence requirements for auth challenges, refresh/session records, provider-wallet links, and signing-key metadata.
- Preserve the current DataConnect handoff and CLI device-code flows while giving them a path to consume the same wallet-rooted credential model later.
- Keep Oko-specific details behind a provider adapter; do not assume Oko silent signing, EIP-7702, or smart-account wallet APIs.
- Require tests that prove the issuer is provider-independent and does not auto-merge accounts by email or provider id.

## Capabilities

### New Capabilities

- `account-domain-identity-issuer`: Account-domain APIs, token shape, JWKS, provider verification, wallet-rooted subject semantics, persistence, and migration boundaries for Vana identity credentials.

### Modified Capabilities

None.

## Impact

- `connect/src/app/api/auth/**`: new account-domain challenge, token, refresh, logout, and JWKS routes.
- `connect/src/lib/auth/**`: issuer, provider verifier adapters, token signing, token verification, nonce/session helpers.
- `connect/src/lib/db/neon.ts` and `connect/migrations/**`: auth challenge/session/provider-link/signing-key persistence.
- `connect/src/app/_components/app-providers.tsx`, `connect/src/app/(public)/login/**`, and `connect/src/app/(handoff)/connect/**`: eventual integration with Vana session issuance while preserving current Privy login behavior.
- `src/core/constants.ts`, `src/cli/auth.ts`, `src/server/connect.ts`, and downstream clients may later consume or verify Vana JWTs, but SDK/CLI changes are not part of the first issuer implementation unless explicitly scoped.
- New direct dependency is likely needed for JWT/JWK work, preferably `jose`, rather than relying on transitive Privy dependencies.
- External dependency decisions: Oko provider proof format, production signing-key storage/rotation, allowed audiences, and whether Stage 1 is JWT-only or OIDC-compatible.
