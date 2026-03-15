# CLI Runtime Portability Notes

This note records the current local conclusions for Batch 5B.

It is intentionally narrower than the full execution playbook. Its purpose is
to answer: "what portability/correctness concerns have already been checked,
what changed in code, and what still remains pre-stable?"

## Confirmed Now

### Display-path invariant

- Human-facing `~` rendering is now centralized in
  [src/cli/render/format.ts](/home/tnunamak/code/vana-connect-cli-pr/src/cli/render/format.ts).
- Functional paths still come from
  [src/core/paths.ts](/home/tnunamak/code/vana-connect-cli-pr/src/core/paths.ts)
  via `os.homedir()` + `path.join(...)`.
- Regression coverage now exists in
  [test/cli/render-format.test.ts](/home/tnunamak/code/vana-connect-cli-pr/test/cli/render-format.test.ts).

Conclusion:

- `~` is currently a presentation concern, not a filesystem API input.

### Concurrent CLI state writes

- `updateSourceState(...)` previously did an uncoordinated read-modify-write.
- It now uses:
  - a bounded lock file (`vana-connect-state.json.lock`)
  - stale-lock cleanup
  - atomic temp-file write + rename
- Regression coverage now exists in
  [test/core/state-store.test.ts](/home/tnunamak/code/vana-connect-cli-pr/test/core/state-store.test.ts).

Conclusion:

- the local CLI now has a defended cross-process story for the single shared
  state file without introducing a third-party lock dependency.

## Still Intentionally Best-Effort

### External `sqlite3` for cookie import

- [src/runtime/playwright/browser.ts](/home/tnunamak/code/vana-connect-cli-pr/src/runtime/playwright/browser.ts)
  still shells out to `sqlite3` when importing cookies from an existing system
  Chrome profile.
- That path is opportunistic:
  - only used for system Chrome profile import
  - skipped entirely for downloaded Chromium
  - swallowed if `sqlite3` is unavailable
  - enabled by default only on macOS
  - gated behind `VANA_ENABLE_SYSTEM_COOKIE_IMPORT=1` on Linux/Windows for
    explicit validation only

Conclusion:

- this is not a core product feature
- the core supported path is Vana-managed browser state plus manual/headed
  login when needed
- macOS keeps the enhancement enabled by default because the original
  `data-connect` implementation was explicitly designed around that platform
- Linux/Windows should remain opt-in until explicitly validated on real
  desktop environments

Validation handle:

```bash
pnpm test:runtime:cookie-import
```

This covers the current product contract:

- macOS enhancement remains available by default
- Linux/Windows skip system-profile cookie import by default
- Linux/Windows can still exercise the import path explicitly with
  `VANA_ENABLE_SYSTEM_COOKIE_IMPORT=1` during targeted validation

### Playwright browser installation

- [src/runtime/managed-playwright.ts](/home/tnunamak/code/vana-connect-cli-pr/src/runtime/managed-playwright.ts)
  still uses Playwright's internal registry API rather than a user-facing CLI
  invocation
- that is deliberate:
  - avoids imposing `npx`/system Node assumptions on users
  - keeps `vana setup` as the single product surface

Conclusion:

- acceptable for now
- still a pre-stable validation item, because it relies on internals rather
  than an explicitly blessed public install API

## Measurement Tooling

Use:

```bash
pnpm runtime:footprint
```

This reports:

- `~/.dataconnect` size
- browser cache size
- browser profile size
- connector cache size
- log size
- installed package runtime size for:
  - `playwright`
  - `playwright-core`
  - `chromium-bidi`

This is meant to replace guesswork when discussing runtime/bundle size.

## Current Position

The remaining portability work before stable is now narrower:

1. explicitly validate Linux/Windows behavior for opt-in system-Chrome cookie
   import using `VANA_ENABLE_SYSTEM_COOKIE_IMPORT=1`
2. re-validate the Playwright internal install path on the final stable track
3. collect actual footprint numbers before designing cleanup/GC behavior
