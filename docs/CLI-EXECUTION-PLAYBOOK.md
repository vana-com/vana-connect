# `vana-connect` CLI Execution Playbook

_As of March 14, 2026_

This document turns the current CLI/runtime/release state into an execution
playbook that lower-reasoning models can follow without needing to reconstruct
all prior design context.

It should be read after:

- [CLI-FINAL-PRODUCT-SPEC.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-FINAL-PRODUCT-SPEC.md)
- [CLI-BEAUTY-IMPLEMENTATION-PLAN.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-BEAUTY-IMPLEMENTATION-PLAN.md)
- [CLI-RUNTIME-PORTABILITY-NOTES.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-RUNTIME-PORTABILITY-NOTES.md)

If this document conflicts with casual conversational guidance, this document
wins.

## Current State

Branch state at the time of this update:

- local work has moved materially past the earlier canary checkpoints
- use `git log --oneline --decorate -10` to confirm the exact local head before pushing

Already true on this branch:

- the in-process runtime is real
- the installer and Homebrew paths are real
- published canary assets work
- `status`, `sources`, `data`, and guided `connect` have been materially
  upgraded
- `doctor`, `version`, and `logs` are now real first-class CLI surfaces
- guided `connect` now has clearer entry, cancellation, and continuation copy
- `status` now points users toward `vana data list` when that is the right next step
- `data show` / `data path` JSON surfaces are more useful for shell tooling
- `logs` now exposes stored run-log paths in both human and `--json` modes
- `sources`, `status`, `data`, and success summaries now use more structured factual rows
- source discovery surfaces now explain whether a source prompts in-terminal or requires a manual browser step
- source discovery now exposes a recommended path in both JSON and human mode
- `data` empty/missing states now include concrete next steps instead of dead-end copy
- `sources --json`, `status --json`, and `data list --json` now expose more top-level guidance metadata
- `doctor --json` now exposes runtime capabilities, lifecycle commands, summary counts, and recent source activity
- successful connects now explicitly mention the saved browser session payoff
- structured runtime `status-update` and `progress-update` events exist
- display-path rendering is now centralized and regression-tested
- CLI state writes now use a lock + atomic-write path with concurrency regression coverage
- runtime footprint measurement now exists via `pnpm runtime:footprint`
- README-facing VHS demos and transcripts are publishing from CI
- local transcript/demo scripts now rebuild first so review artifacts cannot silently drift behind `dist`

This means the next work is no longer “make the CLI exist.”
It is:

1. make the human product feel fully truthful and coherent
2. deepen beauty on top of that stable surface
3. keep release work efficient instead of churning many tiny deploy cycles

## Immediate Local Sequence

Until explicitly told otherwise, the next model should stay in the **local-only
execution lane** and defer:

- canary polling
- Homebrew/tap sync
- hosted installer verification
- published artifact checks

The immediate local sequence is:

1. finish the remaining **Batch 8A: Best-In-Class Finish** local work
2. continue any remaining **Batch 2 / Batch 3** connect-journey and static-surface polish
3. continue local README / transcript / VHS alignment work
4. continue bounded **Batch 5B** work only where it does **not** require external platform validation
5. only switch to external validation once the known local backlog is genuinely exhausted

When deciding what to do next locally, prefer this order:

1. improve the human `connect` journey
2. improve post-success payoff and `vana data`
3. improve first-run/help/discovery coherence
4. improve degraded/manual-flow grace
5. improve operator affordances that are already justified by existing runtime data

Do **not** start external validation just because it is possible.
Only start it when it becomes an input to remaining work or when the local
backlog is meaningfully exhausted.

## Operating Rules

These rules should govern all remaining work.

### 1. Prefer larger local batches

Do not push every small polish change.

Preferred pattern:

- do a coherent local batch
- run the full local preflight
- push once
- let one publish/verification cycle prove the batch

Break that rule only for:

- release-path regressions
- platform-specific packaging failures
- a public artifact problem that needs immediate isolation

### 2. Preserve machine mode

Do not let human-mode beauty work alter:

- `--json` field names
- exit codes
- JSON stdout cleanliness
- machine-readable event contracts

### 3. Treat the README as a product surface

The README is not just documentation.
It is a review surface for:

- install quality
- first-run quality
- CLI beauty progress

Visible demo commands must match what a real user would type.

### 4. Keep demos deterministic

Do not use live credentials or live external websites for README-facing demos.

Use:

- fixture homes
- fake connector state
- deterministic collected data
- deterministic demo connectors where needed

### 5. Primary-agent vs subagent boundary

If Codex subagents are available, use them only for bounded slices with clear
acceptance criteria.

Keep these with the primary agent:

- final product judgment
- cross-batch sequencing changes
- release orchestration
- Homebrew / canary / installer publication decisions
- any JSON contract changes

Good subagent work:

- fixture seeding
- transcript tests
- static surface rendering changes in one command area
- README/demo asset plumbing
- acceptance test harnesses

### 6. Research before product judgment

If a later batch depends on claims about:

- best-in-class CLI prior art
- current Playwright/Node/browser-install support
- current platform behavior on Windows/macOS/Linux
- public release-channel expectations or install norms

then the model executing that batch should research current primary sources
first instead of relying on memory.

Examples:

- official docs
- maintained upstream repos
- current release artifacts
- current platform behavior observed directly

Do not make "best-in-class" or portability decisions from stale assumptions.

## Release Efficiency Lane

This is a continuous lane, not a one-time batch.

Goal:

- reduce deployment tax
- keep release validation automated
- avoid idle waiting

Tasks:

1. Maintain one canonical local preflight command that runs:
   - tests
   - lint
   - format check
   - build
   - transcript capture
   - VHS/demo verification
   - release asset assertions

Current canonical local CLI preflight:

- `pnpm preflight:cli`

2. Maintain one watcher-driven post-publish flow that handles:
   - CI/canary polling
   - Homebrew sync
   - hosted installer verification
   - demo artifact verification
3. Keep README/tap/published canary aligned to the same version.

Good subagent fit:

- script work in `scripts/`
- transcript/demo verification harnesses
- read-only release-asset audits

Primary-agent responsibility:

- deciding when a batch is large enough to justify a publish cycle
- interpreting failed release jobs

## Batch 1: Product-Truth And Demo-Proofing

This is the next mandatory batch.
Do not start deep beauty work before this is externally proven.

### Goals

- the human CLI should feel truthful after success
- the README should be able to show a real successful connect flow
- the public `connect` demo should end on visible payoff, not just progress
  output or fallback guidance
- `status`, `data`, and success summaries should agree with each other

### Work items

1. Add a deterministic successful `connect` demo fixture.
   Likely files:
   - `docs/vhs/fixtures/`
   - `scripts/prepare-vhs-fixtures.mjs`
   - a demo connector fixture under the fixture home

2. Add a README-quality successful connect tape.
   It should show a short success story, not just connector mechanics:
   - `vana connect github`
   - `vana data show github`
     Likely files:
   - `docs/vhs/*.tape`
   - `README.md`
   - `docs/vhs/README.md`

3. Add transcript and regression coverage for that successful connect flow.
   Likely files:
   - `test/cli/index.test.ts`
   - `docs/transcripts/`
   - `scripts/capture-cli-transcripts.mjs`

4. Tighten the final success summary.
   It should consistently answer:
   - what connected
   - what was collected
   - where it was saved or synced
   - what to do next

5. Improve `vana data show` and `vana data path`.
   They should feel like the first payoff surface after success.

6. Improve `vana status`.
   It should better distinguish:
   - runtime installed
   - session present
   - last successful collection
   - local-only vs Personal Server state

7. Broaden acceptance coverage across:
   - migrated/requestInput connectors
   - legacy/manual connectors
   - unsupported source flows
   - saved-session reuse cases

### Exit criteria

- README can show a deterministic successful connect demo
- human success output feels complete without opening JSON
- `status`, `data show`, and the success summary agree semantically
- transcript and acceptance coverage lock the intended behavior

### Good subagent slices

1. Demo fixture and tape lane
   Deliverables:
   - new deterministic connect-success fixture
   - new/updated `.tape`
   - updated `docs/vhs/README.md`

2. Transcript lane
   Deliverables:
   - transcript capture updates
   - transcript assertions/tests

3. `data` payoff lane
   Deliverables:
   - `data show` / `data path` polish
   - tests for human and `--json` behavior

4. `status` truth lane
   Deliverables:
   - richer state rendering
   - tests for nuanced connected-state output

Primary-agent integration:

- final success-summary wording
- deciding what is “truthful enough” for public README use
- release push after local validation

## Batch 2: Deep Beauty, Static Surfaces

Start this only after Batch 1 is published and acceptance-tested from the
real artifact path.

### Goals

- static CLI surfaces should feel deliberate, premium, and recognizably Vana
- beauty should come from hierarchy and rhythm, not ornament

### Work items

1. Refine semantic theme usage.
2. Improve section rhythm, spacing, and emphasis.
3. Tighten `status`, `sources`, `data list`, `data show`, and guided `connect`.
4. Make README demo assets reflect the new visual bar.

### Exit criteria

- static surfaces scan noticeably better than the current baseline
- color-disabled and piped output remains readable
- README demos visibly reflect the upgraded static language

### Good subagent slices

1. `status` surface refinement
2. `sources` surface refinement
3. `data` surface refinement
4. theme/symbol cleanup in `src/cli/render/`
5. README/demo embed refresh

Primary-agent integration:

- aesthetic consistency across commands
- final judgment on whether the CLI feels more premium or just more decorated

## Batch 3: Deep Beauty, Connect Narrative

Only start after static surfaces are stable.

### Goals

- `vana connect <source>` should feel like one calm narrative
- trust, progress, and success/failure pacing should feel intentional

### Work items

1. Improve phase transitions:
   - prepare
   - connect
   - continue
   - success/failure
2. Improve trust framing before auth/input.
3. Improve spinner/checkmark payoff where capabilities allow it.
4. Improve cancellation language.
5. Sharpen the distinction between:
   - connected locally
   - connected and synced
   - manual/legacy flow

### Exit criteria

- connect runs feel like a product journey, not a stream of logs
- human success and failure both land clearly
- the machine contract remains untouched

### Good subagent slices

1. cancellation and interruption copy/tests
2. success/failure summary rendering
3. progress rendering utilities
4. prompt continuity improvements

Primary-agent integration:

- overall connect flow pacing
- deciding whether motion/spinners are helping or distracting

## Batch 4: Runtime Event Enrichment For Beauty

Only do this after Batch 3 exposes an actual event-model limitation.

### Goals

- make human rendering rely on structured events, not fallback heuristics
- improve summaries and progress semantics without destabilizing JSON mode

### Work items

1. Add only the missing event metadata needed for better rendering.
2. Avoid speculative framework-building.
3. Keep event additions backward-compatible where possible.

### Exit criteria

- human rendering no longer needs ad hoc inference where better runtime events
  would be more truthful
- `--json` mode remains stable and test-covered

### Good subagent slices

1. runtime event type additions with tests
2. renderer consumption of new event metadata
3. JSON contract regression tests

Primary-agent integration:

- deciding which event additions are truly needed
- preserving product semantics while changing internal event richness

## Batch 5: Data Interaction And Composability

This batch strengthens the CLI as a tool, not just a guided product surface.

### Goals

- `vana data` should feel useful in both human and shell workflows
- the CLI should compose cleanly with tools like `jq`

### Work items

1. Strengthen `data list`, `data show`, and `data path`.
2. Tighten JSON schemas and error behavior.
3. Make human and machine modes both intentional.
4. Consider compact summaries that are easy to skim and easy to pipe.

### Exit criteria

- `vana data` feels like a real read surface
- `--json` output is stable and shell-friendly

### Good subagent slices

1. JSON-mode regression tests
2. human-surface formatting
3. transcript examples for shell composability

## Batch 5A: Operational Polish And CLI Contract

This batch exists to close the non-glamorous gaps that separate a strong CLI
from a best-in-class one.

### Goals

- make versioning, diagnostics, and lifecycle operations obvious
- make the shell contract explicit and reliable
- improve help/discoverability without weakening the human product surface

### Work items

1. Add an explicit version surface:
   - `vana --version`
   - `vana version`
   - version visibility in `vana --help`
   - version in `status --json`
2. Add a diagnostics surface:
   - likely `vana doctor`
   - runtime/browser/install checks
   - actionable remediation output
3. Define and verify the exit-code matrix:
   - success
   - cancel
   - source required
   - setup required
   - needs input
   - legacy/manual step required
   - connector unavailable
   - runtime/internal failure
4. Audit and tighten the JSON contract:
   - stable top-level shapes
   - no noisy human output in `--json`
   - predictable error payloads
5. Improve lifecycle discoverability:
   - upgrade instructions
   - uninstall/cleanup instructions
   - canary vs stable channel clarity
6. Improve help quality:
   - command descriptions
   - examples
   - first-step orientation

### Exit criteria

- a new user can discover version, help, diagnostics, and upgrade paths from the CLI itself
- script authors have a documented and test-covered exit-code matrix
- `--json` behavior is explicit, stable, and reviewed as a contract
- uninstall/cleanup and channel guidance exist in docs

### Good subagent slices

1. version/help command work
2. `doctor` command scaffolding and tests
3. exit-code matrix tests
4. JSON contract audit/tests
5. install/upgrade/uninstall doc pass

Primary-agent integration:

- deciding what belongs in `doctor` vs `status`
- deciding what version information belongs in normal human surfaces
- protecting the CLI from “helpful” additions that bloat the contract

## Batch 5B: Runtime And Portability Validation

Do this after the main local feature/beauty work is coherent, but before stable
promotion and before spending serious time on deployment polish.

### Why this batch exists

The current code review uncovered a few concerns that are more fundamental than
copy or presentation:

- `src/core/state-store.ts` currently does an uncoordinated read-modify-write of
  `vana-connect-state.json`
- `src/runtime/playwright/browser.ts` opportunistically shells out to
  `sqlite3` for cookie import
- `src/runtime/managed-playwright.ts` intentionally avoids user-facing `npx`,
  but reaches into Playwright internals for browser installation

Those should not derail the current CLI feature work, but they also should not
be left to vague “later” follow-up.

### Goals

- validate correctness and portability risks before stable
- distinguish real problems from speculative LLM concern
- prefer bounded, defensible fixes over reactive dependency churn

### Work items

1. Lock the display-path invariant.
   - Confirm that `~` is presentation-only.
   - Add a narrow regression test or audit proving that display strings never
     feed filesystem APIs.

2. Add a concurrency regression for CLI state writes.
   - Reproduce the failure mode, if any, against `updateSourceState(...)`.
   - Choose the fix based on that reproduction.
   - Prefer atomic-write discipline or a more fundamental state-model change
     over reflexively adding a lockfile package.

3. Audit `sqlite3` portability explicitly.
   - Treat this as a Windows concern first.
   - Current code already tolerates `sqlite3` absence, so the question is
     product impact, not “does the CLI boot”.
   - Decide whether opportunistic best-effort is acceptable for stable or
     whether cookie import must move to an embedded JS/WASM path.

4. Revalidate the Playwright browser-install strategy.
   - Playwright’s official docs still present CLI-driven browser installation as
     the normal path.
   - Our current internal-registry approach may still be the right product
     choice because we cannot require user-facing `npx`.
   - Before stable, confirm whether a cleaner package-owned install path exists
     on current Playwright.

5. Measure browser/runtime asset growth before designing cleanup.
   - Use actual size/update data.
   - If cleanup is needed, design it as an intentional lifecycle feature, not a
     reactionary installer workaround.

### Exit criteria

- the `~` concern is either dismissed with proof or fixed
- state writes have a defended concurrency story
- Windows/sqlite behavior is understood and intentionally accepted or replaced
- the Playwright install path is defended for stable
- size/bloat concerns are based on measurement, not guesswork

### Good subagent slices

1. path invariant audit + tests
2. state-store concurrency reproduction
3. Windows/sqlite portability audit
4. Playwright install-strategy note with code references
5. runtime/browser size measurement script or report

Primary-agent integration:

- deciding whether a concern changes architecture, needs a bounded fix, or can
  remain an explicit non-goal

## Batch 6: Debuggability And Operator Affordances

This batch is for connector authors, agents, and support/debug workflows.

### Goals

- improve insight into what a run is doing without leaking raw browser objects

### Work items

1. expose more structured run-state inspection
2. expose screenshot/state capture where already supported
3. improve failure diagnostics and next-step guidance

### Exit criteria

- failed runs are easier to understand and recover from
- operator workflows improve without contaminating the normal human path

### Good subagent slices

1. run-state reporting
2. screenshot artifact plumbing
3. failure transcript coverage

## Batch 7: Source Discovery And Maturity UX

### Goals

- users should know what to expect before they connect

### Work items

1. improve maturity grouping and labeling in `sources`
2. clarify expectations for automated vs manual flows
3. consider better source ordering and recommendation cues

### Exit criteria

- users can tell which sources are smooth, manual, or legacy before connecting

### Good subagent slices

1. `sources` grouping/rendering
2. maturity-label tests
3. transcript updates

## Batch 8: Public Surface Hardening

### Goals

- README, release assets, Homebrew, installer paths, and demos should all tell
  the same story

### Work items

1. keep README demo embeds aligned to the current canary
2. keep Homebrew and hosted installer paths aligned
3. keep transcripts and demo assets current
4. ensure “discovering this project cold” feels polished

### Exit criteria

- a cold-start user can discover the repo, install the CLI, and feel impressed
  without extra context

### Good subagent slices

1. README polish
2. demo asset sync
3. install-doc consistency checks

Primary-agent integration:

- final public-facing quality bar
- deciding when canary quality is good enough to promote

## Batch 8A: Best-In-Class Finish

This batch exists because "strong CLI" and "best-in-class CLI" are not the
same thing.

Earlier batches improve components:

- command surfaces
- machine contracts
- diagnostics
- demos
- install paths

But best-in-class quality only exists when those parts feel excellent **as one
product**.

### Goals

- the installed CLI should feel premium to a cold user, not just correct
- the human journey should feel great in both the happy path and the degraded path
- the CLI should feel unusually complete compared with typical product CLIs

### Work items

1. Close the cold-start delight gap.
   - install / first-run / first-value path should feel tight and intentional
   - help, version, doctor, and status should reinforce trust immediately

2. Close the connect-journey excellence gap.
   - migrated/requestInput flows should feel calm and premium
   - legacy/manual flows should feel gracefully supported, not second-class
   - success, cancel, unavailable, and runtime-error states should all land well

3. Close the post-success payoff gap.
   - `vana data` should feel like a real reward surface, not just a path printer
   - the first successful run should create obvious momentum for the second

4. Close the public-artifact truth gap.
   - Homebrew / installer / README / demos should reflect the same quality bar
   - no meaningful gap should remain between local branch quality and published experience

5. Compare against real best-in-class expectations, not just the old branch.
   - use the existing beauty brief/research as a bar
   - judge the CLI against `gh` / Vercel / Stripe-style expectations:
     - confidence
     - restraint
     - clarity
     - quality of degraded states

### Exit criteria

- a cold evaluator can discover, install, connect, inspect, and troubleshoot
  without extra context and come away impressed
- the CLI feels premium in:
  - help
  - connect
  - status
  - data inspection
  - diagnostics
- manual/legacy connectors are handled gracefully enough that they do not
  materially undermine the product impression
- published artifact quality matches local branch quality closely enough that
  the README can be trusted as a live product surface

### Good subagent slices

1. cold-start acceptance script and checklist
2. post-success payoff transcript/demo review
3. degraded-state transcript review and polish
4. README/demo/public-surface consistency review
5. prior-art / official-doc research packet for final judgment

Primary-agent integration:

- deciding whether the CLI is merely "good" or actually "best-in-class"
- deciding whether degraded paths are graceful enough
- deciding when the product impression is strong enough to promote beyond canary

## Batch 9: Stable-Release Readiness

Do not start this early.
This is the final readiness lane after the product feels right.

### Goals

- define and prove the criteria for promoting beyond canary

### Work items

1. lock a release-readiness checklist
2. run a full acceptance matrix on published artifacts
3. resolve downgrade/platform/documentation gaps

### Exit criteria

- there is a clear, defensible reason to promote beyond canary

## Deferred Validation Concerns

These are not active batch redirects. Revisit them deliberately once the main
feature/UX work is complete or if current implementation work touches the same
area.

### 1. Display-path tilde handling

Current read:

- likely overstated as a current bug
- functional paths already come from `os.homedir()`-backed helpers in
  `src/core/paths.ts`
- `~` currently appears mainly in human-facing display rendering via
  `formatDisplayPath(...)`

What to validate later:

- confirm no filesystem write/read path is ever sourced from a display string
- keep `~` strictly as a presentation concern

### 2. Concurrent state-file writes

Current read:

- real concern
- today `updateSourceState(...)` does a read-modify-write on
  `vana-connect-state.json` with no coordination
- this can plausibly lose updates under concurrent CLI runs

What to validate later:

- write a concurrency regression test first
- prefer deciding between atomic-write discipline, sharded state, or locking
  based on the actual failure mode
- do not add a lockfile dependency by reflex

### 3. Playwright/browser asset growth

Current read:

- concern may be real, but is unmeasured right now
- not a reason to regress to user-visible `npx`/system-Node assumptions

What to validate later:

- measure installed size and update churn across a few releases
- if bloat is real, prefer managed cache cleanup/lifecycle commands over
  reinstall-heavy behavior

### 4. External `sqlite3` dependency

Current read:

- real cross-platform portability concern
- `src/runtime/playwright/browser.ts` opportunistically shells out to
  `sqlite3` for cookie import
- the code already tolerates failure, so this is not a universal blocker, but
  it may create uneven behavior across machines

What to validate later:

- confirm actual behavior on Windows/macOS/Linux
- decide whether opportunistic best-effort is acceptable or whether the feature
  should move to an embedded JS/WASM approach

### 5. Playwright browser-install API usage

Current read:

- worth re-validating before stable
- current implementation intentionally avoids user-facing `npx`
- it currently reaches into Playwright internals via the registry module in
  `src/runtime/managed-playwright.ts`

What to validate later:

- confirm this remains the best supported path on current Playwright/Node
- if Playwright exposes a cleaner package-owned install entrypoint, prefer that
  over private internals
- do not reintroduce user prerequisites just to become “more official”

## Recommended Execution Pattern

For lower-reasoning models:

1. pick one bounded slice from the current batch
2. state the assumption you are making
3. implement only that slice
4. run the relevant local tests/checks
5. summarize:
   - what changed
   - what was verified
   - what remains for integration

Do not independently:

- redesign the sequence of batches
- change JSON contracts casually
- trigger release work without a coherent batch ready
- decide public README/demo quality alone
