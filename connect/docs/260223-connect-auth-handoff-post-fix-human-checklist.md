# Connect auth handoff: post-fix human checklist

This is a **manual (human-run) post-fix validation checklist** for the connect auth handoff flow.

Purpose:

- verify runtime behavior in a real browser (Privy + wallet + redirects)
- catch integration issues that unit tests can miss

This is a smoke checklist, not a CI replacement.

## Test environment

- Base URL: `https://account.vana.org` (or your local equivalent)
- Browser: fresh incognito/private window
- One valid launch context payload (`sessionId`, `secret`)
- DevTools open (`Console`, `Application` tabs)

## Checklist

### 1) Root canonicalization

Open:

`https://account.vana.org/?sessionId=sess-smoke-1&secret=sec-smoke-1&app=discover-me&authDebug=1`

Expect:

- immediate redirect to `/login?sessionId=...&secret=...&app=discover-me`
- debug-only params (like `authDebug`) are removed from canonical URL

Pass/Fail:

- [ ] Pass
- [ ] Fail

### 2) Connect unauthenticated handoff

From `/connect?...` while signed out.

Expect:

- loading UI is inside panel/card layout (not bare page-level loading)
- redirect to `/login?...` preserving launch context

Pass/Fail:

- [ ] Pass
- [ ] Fail

### 3) Download link whitelist check

On `/connect?...`, inspect the "Download DataConnect" link target.

Expect:

- only handoff/integration params: `sessionId`, `secret`, `app`, `appId`, `appName`
- no debug/internal params (for example `authDebug`, `scenario`)

Pass/Fail:

- [ ] Pass
- [ ] Fail

### 4) Wallet readiness failure path

Force or reproduce wallet-not-ready behavior.

Expect:

- `Preparing...` does not spin forever
- transitions to explicit error state after timeout

Pass/Fail:

- [ ] Pass
- [ ] Fail

### 5) Logout cleanup integrity

1. Hit `/logout`
2. Return to `/login` with no query and sign in

Expect:

- no stale prior `sessionId`/handoff restoration
- fallback behavior for no-context login remains deterministic

Pass/Fail:

- [ ] Pass
- [ ] Fail

### 6) No-context route sanity (non-blocking)

Check:

- `/connect` directly (no query)
- `/` directly (no query)

Expect:

- `/connect` -> deterministic fallback UI (no loops, no crashes); user is not hard-blocked
- `/` -> `/login`

Pass/Fail:

- [ ] Pass
- [ ] Fail

## Known failure signatures

- Lands on `/download-data-connect` after successful login with valid launch context:
  likely handoff context resolution or persistence regression.
- Infinite `Preparing...`:
  likely connect flow phase transition or wallet-timeout regression.
- Debug params leaking into download links:
  likely query whitelist regression in connect page URL construction.

## Final sign-off

- [ ] All checks passed
- ## Notes:
