# Auth Integration Concerns (`_auth`)

## Scope

This document tracks concrete issues in the current `_auth` implementation and the expected follow-up work.

Primary code:

- `auth.ts`
- `components/auth-form.tsx`
- `auth.types.ts`

Primary external reference:

- https://docs.privy.io/recipes/core-js

## 1) `scheduleCloseTab` is not used in success flow

### Current behavior

- `scheduleCloseTab` exists and is tested.
- On successful auth, the UI shows "You may now close this tab." and does not auto-close.

### Risk / mismatch

- Dead code and confusing intent.
- Test implies one UX contract, runtime behavior implies another.

### Follow-up options

- **Option A:** keep manual close UX and remove `scheduleCloseTab` + related test.
- **Option B:** call `scheduleCloseTab()` after successful `/auth-callback` and update UI copy to mention auto-close.

## 2) `localStorage.clear()` clears unrelated app data

### Current behavior

- On non-OAuth visits, auth init runs `localStorage.clear()`.

### Risk / mismatch

- Nukes all origin-scoped storage, not only Privy/session keys.
- Can break unrelated features and cross-tab state.

### Follow-up options

- Replace with scoped key cleanup only (known auth keys).
- Prefer explicit logout/session reset APIs where possible.

## 3) Undocumented / flexible response-shape assumptions

### Current behavior

- Code accepts multiple shape variants:
  - `linked_accounts` and `linkedAccounts`
  - `walletClientType` and `wallet_client_type`
  - `embeddedWallet.create()` result with `result.user` or user at root

### Risk / mismatch

- Helps compatibility short-term, but hides contract drift.
- Makes failures harder to detect when SDK contract changes.

### Follow-up options

- Add explicit type guards for accepted shapes.
- Emit structured telemetry when non-primary shape paths are used.
- Narrow to one canonical shape once SDK contract is confirmed.

## 4) Message listener lifecycle is one-way (no cleanup)

### Current behavior

- A `window.addEventListener("message", ...)` handler is installed once.
- No unmount cleanup path removes it.

### Risk / mismatch

- Listener can persist longer than needed in long-lived sessions.
- Harder debugging if multiple auth mounts happen in one browser session.

### Follow-up options

- Store listener ref and remove it in a cleanup `useEffect` return.
- Keep "single handler" logic while still supporting teardown.

## 5) Backend contract endpoints are assumed, not typed

### Current behavior

- The auth flow depends on:
  - `/auth-callback`
  - `/server-identity`
  - `/check-server-url`
  - `/register-server`
  - `/deregister-server`
  - `/close-tab`
- Responses are consumed with broad casts.

### Risk / mismatch

- Integration breaks become runtime-only.
- Weak compile-time safety for critical auth/server-registration flow.

### Follow-up options

- Add API response/request types in `_auth`.
- Validate JSON responses before use.
- Add integration tests covering non-200 and shape-invalid responses.

## 6) Auth flow and server-registration flow are tightly coupled

### Current behavior

- `handleAuthenticatedUser` immediately transitions into wallet signing and server registration.

### Risk / mismatch

- Hard to reason about errors and retries.
- Authentication success can be delayed by downstream registration behavior.

### Follow-up options

- Split into two explicit phases:
  - phase 1: auth callback success
  - phase 2: post-auth registration bootstrap (best-effort / retryable)
- Decide whether phase 2 should block success UI.

## 7) Internal type source strategy (`auth.internal.types.ts`)

### Current behavior

- `_auth` keeps explicit internal adapter types (`PrivyUser`, `PrivySession`, `PrivyLinkedAccount`).

### Risk / mismatch

- Manual types can drift from SDK contracts over time.

### Decision for now

- Keep explicit internal adapter types for stability and readability.
- Do not import deep/internal SDK type paths.

### Why

- `@privy-io/js-sdk-core` does not currently provide simple public root exports
  for all concrete auth payload types we need in this module.
- Deep imports would be more fragile than explicit local adapter types.

### Future option

- Evaluate deriving types from public method signatures (`ReturnType` /
  `Awaited`) once we decide we want tighter coupling to SDK definitions.

## Suggested execution order

1. Decide `scheduleCloseTab` UX contract.
2. Replace `localStorage.clear()` with scoped cleanup.
3. Introduce type guards + typed API contracts.
4. Add listener cleanup.
5. Split auth vs post-auth registration paths if needed.
6. Keep explicit internal adapter types for now; do not deep-import SDK internal types.
7. Revisit method-signature-derived internal types when SDK typing ergonomics improve.
