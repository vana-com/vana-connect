# `vana-connect` CLI Execution Playbook

_As of March 14, 2026_

This document turns the current CLI/runtime/release state into an execution
playbook that lower-reasoning models can follow without needing to reconstruct
all prior design context.

It should be read after:

- [CLI-FINAL-PRODUCT-SPEC.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-FINAL-PRODUCT-SPEC.md)
- [CLI-BEAUTY-IMPLEMENTATION-PLAN.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-BEAUTY-IMPLEMENTATION-PLAN.md)

If this document conflicts with casual conversational guidance, this document
wins.

## Current State

Branch head at the time of this update:

- `0afda69`

Already true on this branch:

- the in-process runtime is real
- the installer and Homebrew paths are real
- published canary assets work
- `status`, `sources`, `data`, and guided `connect` have been materially
  upgraded
- guided `connect` now has clearer entry, cancellation, and continuation copy
- `status` now points users toward `vana data list` when that is the right next step
- `data show` / `data path` JSON surfaces are more useful for shell tooling
- successful connects now explicitly mention the saved browser session payoff
- structured runtime `status-update` and `progress-update` events exist
- README-facing VHS demos and transcripts are publishing from CI

This means the next work is no longer “make the CLI exist.”
It is:

1. make the human product feel fully truthful and coherent
2. deepen beauty on top of that stable surface
3. keep release work efficient instead of churning many tiny deploy cycles

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
- `status`, `data`, and success summaries should agree with each other

### Work items

1. Add a deterministic successful `connect` demo fixture.
   Likely files:
   - `docs/vhs/fixtures/`
   - `scripts/prepare-vhs-fixtures.mjs`
   - a demo connector fixture under the fixture home

2. Add a README-quality successful connect tape.
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
