# Connect auth handoff: best-fix design

## Problem statement

The connect handoff is currently functional but not deterministic across all auth paths.

User-visible failures we need to eliminate:

1. `Preparing...` can hang when Privy auth resolves but wallet readiness does not.
2. Session context (`sessionId`, `secret`) can be lost through auth/OAuth transitions.
3. Post-login routing can fall through to `/download-data-connect` even when the user started a valid connect launch.
4. Redirect decisions are split across multiple hooks/pages, which makes behavior drift likely.

Current patch mitigates these, but does not provide a single flow contract.

## What we are solving

Define and implement one explicit handoff contract so:

- a valid connect launch always resumes connect after auth
- missing/invalid launch context fails predictably with explicit UX
- the flow is testable from URL-in to deep-link-ready without relying on implicit hook timing

## Goals

- Deterministic routing for `/`, `/connect`, and `/login`.
- Guaranteed launch-context continuity across full-page auth redirects.
- Explicit terminal behavior for all auth/wallet/signing states.
- One place for post-auth destination policy.

## Non-goals

- Route rename (`/login` -> `/sign-in`) in this phase.
- Full UI redesign of connect/download pages.
- Middleware-based client auth/wallet orchestration.

## Source-of-truth contract

## Launch context schema

Handoff context must be modeled as one typed object:

- `version` (schema version for parser compatibility)
- `sessionId` (required for connect resume)
- `secret` (optional)
- `app` / `appId` / `appName` (optional display/integration metadata)
- `returnTo` (validated internal path, default `/connect`)
- `createdAt` (unix ms timestamp for TTL expiry)

If `sessionId` is absent, the flow is not a valid connect launch.

Current source of truth:

- `src/app/(connect)/_shared/handoff-contract.ts` (`ConnectHandoffContext` + parsers/builders)

## Persistence order

Use a strict precedence model:

1. URL query params
2. short-lived server cookie (`vana_connect_handoff`, signed or HMAC-validated)
3. client storage fallback (`localStorage`) for OAuth return recovery

Resolution must stop at first valid source.

## TTL and invalidation

- TTL: 10 minutes from `createdAt`.
- Clear resolved context on terminal states:
  - connect success (`ready`)
  - explicit abandon to non-connect routes
  - expired/invalid context path

## Routing behavior contract

## Route responsibilities

### `/connect`

- Resolve handoff context.
- If no valid `sessionId`, render missing-session state (no redirect loop).
- If unauthenticated, redirect to `/login` while preserving handoff context.
- If authenticated, execute wallet/signing state machine.

### `/login`

- Resolve handoff context from same resolver.
- On auth success:
  - if valid connect context: redirect to `/connect` with canonical params
  - else: route by explicit fallback policy (`/download-data-connect`)

### `/`

- If query includes connect params, canonicalize to `/connect?...`.
- Otherwise route to `/login` (or current default policy).

## Redirect policy centralization

Add one module (example: `src/app/(connect)/_shared/handoff-contract.ts`) that owns:

- parsing
- validation
- persistence
- destination resolution (`resolvePostAuthDestination`)
- cleanup

No route should implement fallback/redirect rules ad-hoc.

## Connect state machine (explicit)

Replace implicit effect coupling with explicit states:

- `boot`
- `resolve-context`
- `auth-check`
- `auth-required`
- `wallet-wait`
- `signing`
- `ready`
- `error`

Required terminal guarantees:

- `wallet-wait` has timeout -> `error`
- signing failure retries once -> `error`
- no state leaves user in infinite non-terminal spinner

## Middleware: should we use it?

Middleware should be minimal and only for URL normalization:

- good use:
  - normalize `/` with `sessionId` query into `/connect?...`
  - drop obviously malformed query payloads early

- bad use:
  - Privy auth decisions
  - wallet readiness checks
  - signing orchestration

Reason: auth/wallet/signing are runtime client concerns; middleware cannot reliably decide them.

## Testing contract

Add tests around contract boundaries, not just component hooks.

Minimum matrix:

1. `/connect?sessionId=...` + unauthenticated -> `/login` -> success -> `/connect?...`
2. OAuth full-page return with dropped query but preserved storage/cookie -> resumes `/connect?...`
3. Authenticated + wallet unavailable past timeout -> `error` state (no infinite preparing)
4. Missing/expired context -> deterministic fallback (`missing session` or `/download-data-connect`, per policy)
5. Context precedence correctness: URL > cookie > localStorage

## Migration plan

1. Introduce `handoff-contract` module and use it read-only in parallel with current logic.
2. Switch `/connect` and `/login` redirect decisions to centralized resolver.
3. Remove duplicate localStorage-only logic from hooks.
4. Add integration tests for full handoff paths.
5. After stabilization, perform route naming cleanup (`/login` to `/sign-in`) with redirect shim.

## Success criteria

- No repro of prepare-stall loop in supported browsers.
- No repro of post-login misroute when launch started with valid session.
- All redirects for connect handoff trace to one resolver module.
- Contract tests pass for URL/cookie/storage recovery paths.
