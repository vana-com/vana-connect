## Why

`account.vana.org` already exists in this repo and already uses Privy for login, embedded wallet creation, DataConnect handoff, CLI device auth, and transitional `/api/sign` behavior. Stage 1 needs this surface to become the durable Vana auth boundary instead of exposing Privy, Para, Oko, email, or app-local sessions as downstream identity.

The next implementation target is auth-focused:

- OIDC-compatible Login with Vana for Memory App and future first-party/third-party apps.
- Privy as the first wallet provider behind Vana-owned account identity.
- Vana account records that distinguish `vana_user_id`, linked wallets, OAuth clients, sessions, consent, and action requests.
- Account-hosted data actions that are initiated after login but are not the same thing as login.

## What Changes

- Add an OIDC provider contract for `account.vana.org`.
- Define `vana_user_id` as the OIDC `sub`, with linked wallet claims as separate claims.
- Define Privy integration behind an adapter, with a transitional path from the current Privy-native login and a target path using Privy custom JWT auth.
- Define app/client registration records for Memory App and future consumers.
- Define account-hosted action requests for user-present data access.
- Define token and action semantics so OIDC tokens are not mistaken for protocol data grants.
- Define Ory Hydra / Ory Network as the control-path issuer evaluation, with the completed `oidc-provider` route-handler spike preserved only as fallback evidence.
- Define the first action result as mock-only and the first non-mock result as encrypted bundle plus short-lived reference.
- Define account-local consent/action events as the first DP RPC-compatible seam.
- Preserve existing `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, and `/api/sign` until follow-up changes explicitly migrate them.

## Capabilities

### New Capabilities

- `account-oidc-privy-actions`: OIDC/Login with Vana, Vana account subject model, Privy wallet-provider boundary, OAuth client model, and account-hosted data-action flow.

### Modified Capabilities

- Supersedes `account-domain-identity-issuer` for the canonical subject model and OIDC requirement.

## Impact

- `connect/src/app/**`: OIDC routes, consent/action pages, and integration with existing login.
- `connect/src/lib/auth/**`: OIDC provider configuration, Vana account model, Privy adapter, token/session helpers.
- `connect/src/lib/db/neon.ts` and `connect/migrations/**`: Vana accounts, linked wallets, OAuth clients, authorization codes, refresh sessions, action requests, action results, and consent/action audit records.
- `connect/package.json` and/or deployment manifests: may add issuer-adapter dependencies, Hydra admin client helpers, or JWT/JWK verification dependencies depending on the chosen issuer shape.
- Existing routes stay compatible unless a task explicitly changes them.
