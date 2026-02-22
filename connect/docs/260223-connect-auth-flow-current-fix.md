# Connect auth flow: current fix

## Scope

This document captures the issues reproduced in the web-to-DataConnect launch flow and the current patch-level fixes implemented in `connect`.

It does **not** cover the full architecture cleanup. That is tracked as a follow-up ("best fix" phase).

## Reproduced problems

### 1) Initial loading state rendered outside panel

- Route: `/connect` (and similarly `/login` during suspense fallback)
- Observed behavior: page-level `Loading...` appeared without the panel shell.
- Expected behavior: loading should remain encapsulated within the same panel/card frame used by the flow.

### 2) `Preparing...` stall in connect flow

- Route: `/connect?sessionId=...&secret=...`
- Observed behavior: flow reached `Preparing...` and stalled.
- Console signal: wallet connector/proxy initialization could fail, leaving no wallet address available.
- Root cause: connect state machine had no terminal/error transition when authenticated state existed without a usable wallet address.

### 3) Post-login redirect to download page instead of connect resume

- Observed behavior: after auth, users could be routed to `/download-data-connect`.
- Expected behavior: resume `/connect` launch when session context exists.
- Root cause: login completion falls back to download route when session context is unavailable in URL/local storage.

## Implemented fixes (current patch)

## UI fallback consistency

- Updated suspense fallbacks in:
  - `src/app/(connect)/connect/page.tsx`
  - `src/app/(connect)/login/page.tsx`
- Both now render loading content inside `PageShell` + `PagePanel`, matching the intended panelized layout.

## Connect-flow resilience

In `src/app/(connect)/connect/use-connect-page.ts`:

- Added wallet address fallback resolution from `user.linkedAccounts` (not only `user.wallet.address`).
- Added timeout guard for wallet initialization:
  - if authenticated but wallet never becomes available within `WALLET_READY_TIMEOUT_MS`, transition to `error`.
- Fixed signing retry behavior to actually trigger one retry path.

## Session continuity

In `src/app/(connect)/connect/use-connect-page.ts`:

- Persist session params (`sessionId`, `secret`) during `/connect` flow to preserve launch context across auth navigation.
- This aligns with login completion logic that can recover params from storage and resume `/connect`.

## Validation performed

- Lint check for modified `connect` files: no errors.
- Targeted tests:
  - `src/app/(connect)/login/use-login-page.test.ts` passed.

## Known limitations (deferred to best-fix phase)

- Redirect decision logic is still split across hooks/routes.
- Launch-context contract is still mostly client-side.
- No single explicit state-machine module governs all auth/connect transitions.
- Route naming mismatch remains (`/login` route while UI copy says "Sign in").
  - Decision: rename after flow correctness is fully stabilized.
