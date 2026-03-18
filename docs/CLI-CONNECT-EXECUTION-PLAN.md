# Connect Flow Execution Plan

_March 17, 2026_

Implementation plan for transforming `vana connect <source>`.

Reference: CLI-DESIGN-SKILL.md for principles, CLI-CONNECT-FLOW-DESIGN.md
for the full path tree.

## Phase 1: ConnectRenderer (the new rendering primitive)

Build `src/cli/render/connect-renderer.ts` — a phase-aware renderer
specific to the connect flow.

```typescript
interface ConnectRenderer {
  title(source: string): void;
  scopeActive(scope: string): void;
  scopeDone(scope: string, detail?: string): void;
  scopeFailed(scope: string, error: string): void;
  success(message: string): void;
  detail(message: string): void;
  fail(message: string): void;
  bell(): void;
  cleanup(): void;
}
```

Implementation:

- Uses `ora` for the active scope spinner (already a dependency)
- Scope lines rendered below the spinner via ANSI cursor control
  (`\x1b[{n}A` to move up, `\x1b[2K` to clear)
- On non-TTY: falls back to simple `console.log` per line
- Track line count for cursor management
- ~80–100 lines of code. No new dependencies.

Test: unit test that captures stdout and verifies line content
and order for happy path, failure, and mixed scenarios.

## Phase 2: Refactor runConnect()

Rewrite the rendering path of `runConnect()` to use ConnectRenderer
instead of the generic emitter.

Keep:

- All event emission (unchanged)
- All state updates (unchanged)
- All `--json` behavior (unchanged)
- The runtime event loop (unchanged)

Change:

- Title: `renderer.title("GitHub")` instead of `emit.title()`
  - `emit.section("Preparing")`
- Phase transitions: remove `emit.section("Connecting")`,
  `emit.info("Collecting your data...")`
- Scope progress: map `progress-update` events to
  `renderer.scopeActive()` / `renderer.scopeDone()`
- Success: `renderer.success("Connected GitHub.")` +
  `renderer.detail(...)` instead of multi-section output
- Bell: `renderer.bell()` on completion
- Failure: `renderer.fail()` with recovery command

Phases that should produce NO output when fast:

- Runtime check (<100ms when installed)
- Connector fetch (<1s when cached)
- Session reuse check

Phases that DO produce output:

- Runtime install (needs user confirmation — use existing prompt)
- Credential prompts (use @clack/prompts text/password)
- Collection progress (scope manifest via ConnectRenderer)
- Success/failure summary

## Phase 3: Styled prompts

Add `@clack/prompts` as a dependency. Use it ONLY for the interactive
input components: text(), password(), confirm(), select().

Wire into the connector runtime's `requestInput` callback:

- Map connector field requests to clack text/password prompts
- Map setup confirmation to clack confirm
- Map source picker to clack select

Keep our visual framing (no clack intro/outro/bars). Just the input
components.

## Phase 4: Polish details

- Bold on title and success line only
- Green ✓, red ✗, blue spinner, muted counts
- One blank line before success (the pause)
- Terminal bell on completion
- "Next:" line uses journey-aware suggestion logic
- Failure auto-retries connector update before giving up
- Cancellation renders "Cancelled." and exits cleanly

## Phase 5: Path tree coverage

Test every branch from CLI-CONNECT-FLOW-DESIGN.md:

Happy paths:

- [ ] Session reuse, PS available, all scopes sync
- [ ] Session reuse, PS available, partial sync
- [ ] Session reuse, no PS
- [ ] First time, credentials needed, PS available
- [ ] First time, 2FA needed
- [ ] First time, runtime setup needed

Failure paths:

- [ ] Source not in registry
- [ ] Connector download fails
- [ ] Checksum mismatch (auto-retry with latest)
- [ ] Browser auth, no display available
- [ ] Collection fails mid-way (auto-retry)
- [ ] Collection timeout
- [ ] --no-input + needs input
- [ ] User cancels prompt
- [ ] User cancels with ctrl+c

Edge cases:

- [ ] Non-TTY output (CI, piped)
- [ ] --json mode unchanged
- [ ] --quiet mode
- [ ] Narrow terminal (<80 cols)

## Phase 6: Consistency pass

After connect is transformed, audit other commands for consistency:

- `vana collect` should use the same scope manifest
- `vana server sync` should use similar progress rendering
- `vana sources` and `vana status` should use the same symbol
  and color vocabulary (but NOT the ConnectRenderer — they're
  static, not temporal)
- Help text and error messages should follow the copy principles

## Phase 7: Transcripts and demos

- Update CLI-TRANSCRIPTS.md with new connect output
- Update VHS tapes for connect flows
- Update CLI-REVIEW-SURFACE.md
- Run `pnpm validate`

## Phase 8: Release

- Commit as one coherent batch
- Push to feat/connect-cli-v1
- Verify canary release
- Test via `pnpm dlx @opendatalabs/connect@canary connect github`

## What NOT to change

- Other commands' emitter (status, doctor, sources, data)
- The event model
- The state model
- --json output
- Exit codes
- The CLI-DESIGN-SKILL.md principles

## Estimated scope

- ConnectRenderer: ~100 lines new code
- runConnect refactor: ~200 lines changed (net reduction likely)
- @clack/prompts integration: ~50 lines
- Polish details: ~30 lines
- Tests: ~150 lines new
- Transcripts/docs: updates only

This is a focused refactor of one command's rendering layer.
The architecture, event model, and machine contract are untouched.
