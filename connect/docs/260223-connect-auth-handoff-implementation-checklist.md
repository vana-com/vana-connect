# Connect auth handoff: implementation checklist

Use this with `260223-connect-auth-handoff-best-fix.md`.

## Phase 0: lock contract (no behavior change)

- [ ] Add `handoff-contract.ts` in `src/app/(connect)/_shared/`
- [ ] Define `ConnectHandoffContext` type
- [ ] Implement pure helpers:
  - `parseFromSearchParams()`
  - `parseFromCookie()`
  - `parseFromStorage()`
  - `isValidHandoffContext()`
  - `isExpiredHandoffContext()`
  - `toConnectUrl()`
- [ ] Define source precedence constant: `url > cookie > storage`
- [ ] Add unit tests for parsing/validation/precedence

Acceptance:

- No route imports changed yet.
- Tests verify exact precedence and TTL behavior.

Suggested commit:

- `refactor(connect): add handoff contract primitives`

## Phase 1: centralized persistence + resolution

- [ ] Add contract-side functions:
  - `resolveHandoffContext()`
  - `persistHandoffContext()`
  - `clearHandoffContext()`
  - `resolvePostAuthDestination()`
- [ ] Add server cookie key constant (`vana_connect_handoff`)
- [ ] Add serialization format version (`v1`) for forward compatibility
- [ ] Add integration-ish tests for destination policy:
  - valid context -> `/connect?...`
  - missing context -> `/download-data-connect`

Acceptance:

- No ad-hoc destination logic required in hooks.
- Resolver is the only destination policy implementation.

Suggested commit:

- `refactor(connect): centralize handoff destination resolution`

## Phase 2: migrate `/connect` to contract

- [ ] Update `/connect` flow to call `resolveHandoffContext()`
- [ ] Remove direct query/localStorage handoff reads from `use-connect-page`
- [ ] Use contract `persistHandoffContext()` at connect entry
- [ ] Keep current timeout + retry behavior, but source context via contract
- [ ] Ensure missing context path is deterministic (`missing session` UI)

Acceptance:

- `/connect` behavior unchanged for valid sessions.
- No duplicated context parsing in `/connect` code.

Suggested commit:

- `refactor(connect): use handoff contract in connect route`

## Phase 3: migrate `/login` to contract

- [ ] Update login completion to use `resolvePostAuthDestination()`
- [ ] Remove localStorage-only fallback logic from `use-login-page`
- [ ] Preserve OAuth return behavior via contract source precedence
- [ ] Keep UI copy unchanged in this phase

Acceptance:

- Valid launch context always returns to `/connect?...` after auth.
- Download fallback only when no valid context exists.

Suggested commit:

- `refactor(connect): route login completion through handoff resolver`

## Phase 4: root route + optional middleware normalization

- [ ] Keep root behavior deterministic:
  - `/` + `sessionId` => canonicalize to `/connect?...`
  - `/` without context => current default (`/login`)
- [ ] Optional: add thin middleware for URL normalization only
- [ ] Do not add auth/wallet/signing logic to middleware

Acceptance:

- Canonicalization is consistent across direct and redirected entry.
- Middleware (if added) has no app-state branching.

Suggested commit:

- `refactor(connect): normalize connect entry routing`

## Phase 5: state machine hardening

- [ ] Introduce explicit connect states:
  - `boot`, `resolve-context`, `auth-check`, `auth-required`,
    `wallet-wait`, `signing`, `ready`, `error`
- [ ] Replace implicit effect-only transitions with explicit transition function
- [ ] Keep retry-once signing policy
- [ ] Keep wallet timeout policy
- [ ] Add transition tests for non-terminal spinner prevention

Acceptance:

- No infinite `Preparing...` state from missing wallet readiness.
- Every state has defined exit conditions.

Suggested commit:

- `refactor(connect): formalize connect auth state machine`

## Phase 6: end-to-end contract coverage

- [ ] Add test matrix for handoff continuity:
  - `/connect?sessionId=...` unauthenticated -> `/login` -> `/connect?...`
  - OAuth return with dropped query -> recovered via cookie/storage
  - wallet timeout -> explicit error state
  - missing/expired context -> deterministic fallback
- [ ] Add regression test for source precedence (`url > cookie > storage`)

Acceptance:

- Repro scenarios from incident are encoded in tests.

Suggested commit:

- `test(connect): cover auth handoff continuity matrix`

## Phase 7: cleanup + naming follow-up

- [ ] Remove dead helpers/constants replaced by contract
- [ ] Document final contract in `connect/docs`
- [ ] Only after stabilization: route naming pass (`/login` vs "Sign in")

Suggested commits:

- `chore(connect): remove obsolete handoff helpers`
- `docs(connect): finalize handoff contract reference`
- `refactor(connect): align sign-in route naming` (separate PR)

## Post-implementation note

Implementation outcome so far:

- Contract module + resolver flow is in place and wired through `/`, `/connect`, `/login`, `/logout`.
- Root canonicalization + URL whitelist behavior is implemented.
- Handoff continuity tests and route tests were added and are passing.
- Build now passes (`pnpm --dir connect build`).

Contract metadata semantics (documented + implemented):

- `version`: serialized schema version used to keep parser compatibility explicit.
- `createdAt`: unix timestamp (ms) used for TTL checks.
- `returnTo`: validated internal path with default `/connect`.

Source of truth:

- `src/app/(connect)/_shared/handoff-contract.ts` (`ConnectHandoffContext`, parsers, URL builders)

### Repro checklist status (original report)

| Step                                                      | Expected                                            | Status            | Why                                                                   |
| --------------------------------------------------------- | --------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| Open deep link flow (`/connect?sessionId=...&secret=...`) | Flow starts in panelized loading state              | ✅ Pass           | Suspense fallback wrapped in `PageShell + PagePanel` on connect/login |
| Initial loading visual containment                        | No bare page-level `Loading...`                     | ✅ Pass           | Both `/connect` and `/login` fallback are panel-contained             |
| `Preparing...` during auth/sign prep                      | Should not hang forever                             | ✅ Pass (guarded) | Explicit `wallet-wait` phase + timeout -> error                       |
| Auth required branch                                      | Redirect to `/login` with handoff context preserved | ✅ Pass           | Central resolver + `toLoginUrl()`                                     |
| OAuth return with dropped query                           | Recover session context and resume                  | ✅ Pass           | Resolution precedence: URL > cookie > storage                         |
| Post-login destination after valid handoff                | Return to `/connect?...` (not download)             | ✅ Pass           | `resolvePostAuthDestination()` centralized                            |
| Download fallback                                         | Only when no valid context exists                   | ✅ Pass           | Explicit fallback policy + tests                                      |
| Debug/internal query leakage to download URL              | Should be filtered                                  | ✅ Pass           | Raw passthrough removed, whitelist-based URL building                 |
| Root route with handoff query                             | Canonicalize to `/connect?...`                      | ✅ Pass           | Root route + middleware normalization                                 |
| Logout hygiene                                            | Clear handoff context                               | ✅ Pass           | `logout` now calls `clearHandoffContext()`                            |

### Residual real-world risk

- **Privy/wallet runtime edge behavior** still needs live browser sanity checks (timeouts are guarded, but UX timing is runtime-dependent).
- **No full automated browser E2E** yet; coverage is strong at unit/integration level.

### Confidence

- **High**: routing + handoff contract correctness.
- **Medium-high**: wallet runtime behavior.

## Follow-up TODOs

- [ ] Run the human post-fix checklist in `260223-connect-auth-handoff-post-fix-human-checklist.md` on staging/prod.
- [ ] Migrate Next 16 `middleware` file convention to `proxy` (build warning currently expected).
- [ ] Add one browser E2E flow (Playwright/Cypress) for deep-link -> login -> connect resume.
- [ ] Decide whether `secret` should be excluded entirely from client persistence (currently cookie-redacted, storage-kept).
- [ ] Add explicit callback-marker contract docs for OAuth-return detection keys.
