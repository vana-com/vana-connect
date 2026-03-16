# `vana-connect` CLI Beauty Implementation Plan

_As of March 14, 2026_

## Purpose

This document turns the CLI beauty research into an execution plan for the real
`vana` product.

It is not a brainstorm. It is the recommended implementation path for making
the human-facing CLI feel best-in-class while preserving:

- the existing command grammar
- the existing agent/machine contract
- the current runtime architecture direction
- broad terminal compatibility

It should be read together with:

- [CLI-UX-QUALITY-BAR.md](CLI-UX-QUALITY-BAR.md)
- [CLI-AUDIENCE-CONTRACT.md](CLI-AUDIENCE-CONTRACT.md)
- [CLI-ONBOARDING-COPY.md](CLI-ONBOARDING-COPY.md)
- [CLI-UX-SIMULATION.md](CLI-UX-SIMULATION.md)
- [CLI-EXECUTION-PLAYBOOK.md](CLI-EXECUTION-PLAYBOOK.md)
- Terminal CLI Beauty Memo (data-connectors/skills/vana-connect/docs/cli-beauty-research/terminal-cli-visual-and-emotional-beauty-memo.md)

## Final Recommendation

Build beauty as a **human-mode presentation layer** over the existing command
model and event model.

Do **not** turn `vana` into a full-screen TUI.

Do **not** let beauty mutate the `--json` contract.

Do **not** optimize for the most dramatic terminal techniques. Optimize for:

- clean hierarchy
- confident pacing
- spinner-to-checkmark payoff
- stronger success moments
- small, composable read surfaces
- compatibility-first richness

The target feel is closer to:

- Vercel for narrative pacing
- `gh` for restraint
- `@clack/prompts` for interactive continuity

Not:

- a Bubble Tea-style full-screen app
- a coding-agent TUI clone
- a flashy branded terminal demo

Important:

This plan by itself is **necessary but not sufficient** for best-in-class
quality.

Beauty work can make the CLI feel premium, but it does not automatically close:

- cold-install trust
- degraded/manual-flow excellence
- post-success payoff quality
- public-artifact truth

Those are tracked explicitly in:

- [CLI-EXECUTION-PLAYBOOK.md](CLI-EXECUTION-PLAYBOOK.md)
  under **Batch 8A: Best-In-Class Finish**

## Brand palette anchor

The CLI should not invent its own theme. It should derive its semantic color
choices from the shared Vana product palette in:

- [shadcn.css](https://github.com/vana-com/vana-app/blob/main/packages/ui/src/styles/shadcn.css)

Important tokens in that file:

- neutral black/white base
- `--accent`: Vana blue (`#4141fc`)
- `--destructive`: product red
- `--success`: product green
- muted neutrals like `--foreground-secondary` and `--frostgray`

In terminal form, this should be a **semantic downsampling**, not a literal
translation.

Use the palette like this:

- headings and primary labels: neutral bold
- active step / selected source / key emphasis: Vana blue when color allows it
- success: green
- warning: yellow or amber terminal-safe equivalent
- error: red
- supporting text: dim neutral

Important:

- do not make the whole CLI blue
- do not require truecolor to feel like Vana
- the brand should show up mostly in emphasis and pacing, not saturation

## What The Research Implies

The research points to five conclusions that matter here.

### 1. Most beauty is not decoration

The highest-leverage improvements are in:

- spacing
- section hierarchy
- calm progress
- spinner/checkmark transitions
- clear start and end states

Not in banners, gradients, or dense terminal chrome.

### 2. Temporal design matters more than static styling

`vana connect` is a long-running, state-changing command. That means the user
experience is primarily about:

- what appears first
- what changes over time
- whether progress feels trustworthy
- whether success lands with a payoff moment

The transition from “working” to “done” matters more than adding more color.

### 3. Node has a practical ceiling

The right architecture is **not** a custom terminal framework.

For this CLI, the right stack is:

- simple output rendering
- render-in-place where needed
- careful prompt selection
- no alternate screen buffer
- no heavy React/Ink dependency for v1 beauty

### 4. Compatibility is part of the product

The beauty layer must degrade cleanly across:

- Homebrew installs on macOS
- Linux terminals
- tmux / SSH
- CI / non-TTY
- users with `NO_COLOR`

This excludes a lot of terminal theatrics from the default path.

### 5. Beauty should preserve composability

Best-in-class for `vana` is not just “looks nice.”

It also means:

- `--json` stays deterministic
- output can still be piped when explicitly requested
- humans get a better default
- advanced users can still compose with tools like `jq`

## README demo strategy

The README should become a reliable progress surface for the team, not just a
reference page.

To support that, add **VHS-based terminal recordings early**, not at the end.

Why:

- they make progress visible to people who are not running the branch locally
- they force the human-mode CLI to stay coherent across releases
- they create a deterministic review artifact instead of ad hoc screenshots
- they make README updates a meaningful indicator of product quality

The right model is:

- checked-in `.tape` files under a dedicated folder such as `docs/vhs/`
- deterministic fixture data and temp-home setup
- generated SVG assets committed to the repo for README use
- CI verification that the tapes still render

Important:

- do not rely on live credentials or real connector runs for README demos
- do not make VHS the source of truth for behavior; tests remain the source of truth
- do treat VHS as a first-class product artifact that should stay current

## Product Decision

The CLI should have **two rendering layers** over one command surface:

### Layer 1: Machine mode

Unaffected by beauty work.

Rules:

- `--json` remains pure structured output
- no decorative lines
- no spinners
- no extra prose
- stable field names and exit codes

### Layer 2: Human mode

This is where beauty work happens.

Rules:

- readable hierarchy
- visually distinct phases
- clear trust framing
- minimal but meaningful motion
- satisfying success summary
- one useful next step

## Non-Negotiable Constraints

These are product constraints, not preferences.

1. `vana connect <source>` remains the canonical first command.
2. Human mode must remain calm and serious, not playful or noisy.
3. `--json` mode must remain stable and decoration-free.
4. Beauty must not depend on full-screen terminal control.
5. Beauty must not materially degrade performance.
6. No output design should assume Nerd Fonts, emoji correctness, or truecolor.
7. Artifact paths remain supporting detail, not the story.
8. A successful run must feel like an outcome, not a file write.

## What To Build

## 1. A real terminal presentation system

Introduce a dedicated human-rendering layer inside the CLI.

Suggested internal shape:

- `src/cli/render/capabilities.ts`
- `src/cli/render/theme.ts`
- `src/cli/render/symbols.ts`
- `src/cli/render/format.ts`
- `src/cli/render/progress.ts`
- `src/cli/render/prompts.ts`

This should own:

- color decisions
- symbol decisions
- section spacing
- phase rendering
- spinners / transitions
- fallback behavior

The command handlers should describe **meaning**, not styling:

- phase started
- phase completed
- success
- warning
- failure
- supporting detail

## 2. Capability-aware rendering

Define explicit rendering tiers.

### Tier A: Plain

Used for:

- non-TTY
- CI
- `NO_COLOR`
- future screen-reader/plain modes

Rules:

- no spinner animation
- no render-in-place
- ASCII-safe symbols only
- plain line-by-line output

### Tier B: Standard interactive

Default target for most users.

Rules:

- 4-bit or 8-color hierarchy
- Unicode symbols with ASCII fallback
- simple render-in-place spinners
- no exotic OSC features required

### Tier C: Rich interactive

Optional enhancement when capabilities support it.

Rules:

- slightly richer color hierarchy
- optional hyperlinks later
- same layout as Tier B, not a different product

Important:

`vana` should **not** require truecolor to feel polished.

## 3. A semantic theme, not ad hoc styling

Do not scatter raw color calls through command logic.

Define semantic tokens like:

- `accent`
- `muted`
- `success`
- `warning`
- `error`
- `heading`
- `dim`

Define semantic symbols like:

- `success`
- `error`
- `warning`
- `info`
- `bullet`
- `arrow`
- `spinner`

Map those semantic tokens back to the shared Vana palette first, then downgrade
them per capability tier.

Do not require external icon sets.

## 4. An event-to-progress bridge

The current CLI is still underpowered here.

Beauty work should **not** parse log files for progress. It should render from
structured runtime events.

That means the runtime event model should be extended to support human progress.

Minimum new event types:

- `phase-start`
- `phase-update`
- `phase-complete`
- `status-update`
- `count-update`

Example payloads:

```json
{"type":"phase-start","source":"github","phase":{"key":"auth","label":"Signing in"}}
{"type":"phase-update","source":"github","phase":{"key":"collect","label":"Collecting"},"message":"Fetched 2 repositories","count":2}
{"type":"phase-complete","source":"github","phase":{"key":"collect","label":"Collecting"}}
```

This is the backbone for:

- calm progress
- spinner/checkmark transitions
- meaningful counts
- better success summaries

Without this, the beauty layer will remain shallow.

## 5. A stronger prompt model

The current prompt layer is serviceable, not great.

Recommended direction:

- use `@clack/prompts` for human interactive flows
- keep `--json` / `--no-input` behavior unchanged

Why:

- vertical narrative continuity is a high-value, low-risk beauty technique
- prompt flows are part of the emotional arc
- the current inquirer-based experience is functionally fine but visually thin

Use it for:

- `vana connect` source picker
- setup confirmation
- credential prompts
- 2FA prompts

Do not use it to create a mini-app. Use it to make existing interaction feel
cohesive.

## 6. Better static surfaces

Before richer motion, the static command surfaces need to feel more deliberate.

### `vana connect`

Requirements:

- `vana connect` with no source becomes a guided entrypoint
- no raw Commander argument error
- source picker shows:
  - name
  - auth maturity badge
  - one-line description

### `vana sources`

Requirements:

- more legible list hierarchy
- install state and auth maturity stay visible
- optional grouping later:
  - connected
  - available
  - legacy/manual

### `vana status`

Requirements:

- compact but more deliberate section styling
- runtime / Personal Server / sources clearly separated
- source lines should scan in one pass
- one detail line max beneath a source unless expanded later

### `vana data`

This command family should exist as the first read surface for collected data.

Minimum scope:

- `vana data list`
- `vana data show <source>`
- `vana data path <source>`

This is not only about utility. It creates the post-success payoff loop:

- connect
- inspect
- trust

## 7. A better connect narrative

Human `vana connect <source>` should feel like one narrative with visible phase
changes.

Recommended flow:

1. connector resolution
2. setup/runtime preparation if needed
3. trust framing before auth
4. auth/input collection
5. collection progress
6. sync/local-save outcome
7. success summary

Each phase should:

- start cleanly
- not spam intermediate output
- end with a visible state transition

This is where spinners should live, but with restraint.

## 8. A real success moment

The current success state is still too weak.

The human success moment should include:

- source name
- what was collected
- where it went
- one next step

Recommended shape:

```text
Connected GitHub.

Collected:
- Profile: tnunamak
- Repositories: 2
- Starred: 0

Saved locally:
- /Users/tim/.dataconnect/last-result.json

Next:
- Run `vana status`
- Or inspect the data with `vana data show github`
```

Important:

- the summary is the trophy moment
- the artifact path is supporting detail
- counts and examples are better than generic “done”

## 9. Clear error beauty

Failure states should get the same visual discipline as success states.

Rules:

- one-line diagnosis first
- one actionable next step second
- log path third
- no stack traces in normal human mode

This especially matters for:

- setup failure
- missing source
- auth failure
- legacy/manual source flows
- connector broke / site changed

## Explicit Non-Goals For v1 Beauty

Do not build these into the first beauty pass:

- full-screen TUI
- alternate screen buffer
- React/Ink interface
- theme system exposed to users
- ASCII banners / logo art
- emoji as core semantics
- truecolor-only visuals
- OSC 8 hyperlinks as required UX
- heavy box drawing everywhere
- animated success banners

These either increase risk, increase maintenance cost, or violate the quality
bar.

## Recommended Implementation Stack

### Keep

- current command handlers
- current runtime/event architecture
- current `--json` contract

### Add

- `@clack/prompts` for interactive human prompts
- `picocolors` for lightweight color styling
- `ora` for simple spinner/checkmark transitions

### Build in-house

- capability detection and downgrade rules
- semantic theme
- symbols with ASCII fallback
- connect flow renderer
- static section formatter
- success summary formatter

### Do not add now

- Ink
- Listr2
- Blessed
- alternate screen renderer

## Why this stack

`@clack/prompts` gives narrative continuity for prompts.

`picocolors` keeps styling small and fast.

`ora` gives the right primitive for spinner-to-checkmark transitions without
dragging in a larger rendering framework.

The rest should be custom because the product surface is small and the quality
bar is specific.

## Compatibility Strategy

The beauty layer should respect:

- `process.stdout.isTTY`
- `NO_COLOR`
- `CI`
- `TERM=dumb`

Later, consider explicit flags:

- `--color=auto|always|never`
- `--plain`
- `--screen-reader`

But do not block the first beauty pass on adding them.

The important rule is:

- if the environment is uncertain, downgrade gracefully

## Performance Rules

These are hard rules.

1. No spinner for operations that finish below perception threshold.
2. No progress update on every tiny event.
3. No render loop driven by timers alone when there is meaningful event data.
4. Prefer event-driven updates to artificial animation.
5. Never let progress rendering materially slow setup/connect.

Specific rule of thumb:

- if an operation completes in under ~250ms, print nothing but the resulting
  state
- if it lasts longer, show one spinner or one phase line

## Acceptance Criteria

The beauty pass is not done until all of these are true.

### Human mode

1. `vana connect` without a source is a graceful, guided entrypoint.
2. `vana connect github` has visible but calm phase transitions.
3. A successful run ends with a strong success summary.
4. A local-only success clearly differs from a Personal Server sync success.
5. `vana status` is more legible without becoming verbose.
6. `vana data show github` feels like a real payoff surface.
7. Cancelling a prompt does not dump an exception stack.

### Machine mode

1. `--json` output is unchanged except for intentional schema additions.
2. No decorative lines or ANSI output appears in `--json`.
3. Exit codes remain stable.

### Compatibility

1. Output remains readable with color disabled.
2. Output remains readable when piped or in CI.
3. The CLI does not require truecolor or Nerd Fonts.

### Performance

1. The beauty layer does not introduce visible lag in common flows.
2. No progress rendering causes measurable regressions similar to the npm
   progress-bar failure mode.

## Execution Order

This is the recommended sequence.

### Current Branch State And Revised Sequencing

As of branch head `0afda69`, the plan above is no longer hypothetical.
Substantial parts of the foundation are already present:

- a human renderer/theme layer exists
- `status`, `sources`, and `data` have been upgraded materially
- `vana connect` has a guided no-source entrypoint with clearer cancellation
  and direct-command copy
- structured runtime `status-update` and `progress-update` events now exist
- deterministic success demos, transcripts, and README-facing VHS assets are
  publishing from CI
- successful connects now land with a stronger payoff moment, including saved
  session messaging

That means the next phase should **not** start from Phase 1 again and should
not repeat the already-finished product-truth work.
The correct sequence from here is:

### Batch 1: Product-truth and demo-proofing follow-through

This batch is mostly complete. The remaining work should be follow-through only:

- keep tightening any remaining rough edges surfaced by real acceptance tests
- broaden acceptance coverage across:
  - migrated/requestInput connectors
  - legacy/manual connectors
  - unsupported sources
  - saved-session reuse cases
- keep README, transcripts, and published demo assets aligned with the current
  canary

Important:

- this is now a cleanup/follow-through lane, not the main product frontier
- it should still be pushed as larger release cycles, not many tiny deployment
  cycles

### Batch 2: Deep beauty, static-first

This is now the main frontier. Focus first on the surfaces that are already
semantically stable.

- refine spacing, hierarchy, and semantic color usage across:
  - `status`
  - `sources`
  - `data list`
  - `data show`
  - guided `connect`
- make the renderer feel distinctly Vana without saturating the terminal
- improve line rhythm, section headings, bullets, and emphasis
- upgrade README VHS assets so they reflect this calmer, more deliberate visual
  language

This is where the CLI should start to feel clearly above the current baseline,
but without touching the machine contract.

### Batch 3: Deep beauty, connect narrative

After static surfaces are strong, apply the beauty work to the long-running
human `connect` flow itself.

- phase transitions that feel calm and intentional
- better pacing from prepare -> connect -> continue -> success/failure
- stronger trust framing before auth/input collection
- tasteful spinner/checkmark transitions where terminal capabilities allow them
- cleaner cancellation language
- cleaner local-only vs Personal Server success distinction

This batch should make `vana connect <source>` feel like a product journey, not
just a sequence of log lines.

### Operational polish after beauty

Do not let the beauty work crowd out the less visible CLI quality bar.

After the static and connect-narrative beauty batches are stable, run an
explicit operational-polish pass covering:

- `vana --version` / `vana version`
- help quality
- a diagnostics surface, likely `vana doctor`
- exit-code matrix review
- JSON contract audit
- upgrade/uninstall/channel clarity

This is part of the best-in-class bar even though it is not primarily visual.

### Batch 4: Runtime event enrichment for beauty

Only after the human connect narrative is visibly better should we deepen the
runtime event model further.

- add any remaining phase/count/completion metadata needed for better summaries
- avoid log scraping entirely for human rendering
- preserve a pristine `--json` contract while making human progress richer

This keeps the event model in service of product quality rather than speculative
framework-building.

### Batch 5: Public polish and release hardening

- keep README demos, transcripts, installer paths, and Homebrew output aligned
  to the same canary
- acceptance-test the published artifact as if discovering the project cold
- only then decide what is ready to graduate from canary to a more stable lane

### Batching rule from here

The branch should now prefer:

- larger locally validated batches of product/UI work
- fewer deployment cycles
- deployment-triggering pushes only when the batch is worth external proof

Break that rule only for:

- a release-path regression
- a platform-specific packaging failure
- a public artifact problem that needs immediate isolation

This is the right optimization now that the runtime and installer paths are
substantially real.

### Deployment streamlining guidance

The current bottleneck is no longer local implementation speed. It is repeated
publish/verify latency.

The branch should therefore optimize for:

- one larger, coherent product/UI batch per release cycle
- one canonical local preflight before pushing
- one canonical post-publish verification path

Recommended operating model:

1. Local preflight should become one command that runs the entire release-ready
   guardrail set:
   - tests
   - lint/format
   - build
   - transcript capture
   - demo rendering verification
   - release-asset assertions
2. The publish path should become one watcher-driven flow:
   - wait for CI/canary
   - sync Homebrew
   - verify hosted installer
   - verify demo assets
3. Avoid pushing while a release lane is still proving the previous batch unless
   the current head is blocked by:
   - a release-path failure
   - a packaging/platform regression
   - a public artifact issue

In other words:

- local work should continue optimistically
- release validation should be automated
- publish-triggering pushes should be less frequent and more substantial

### Phase 1: Foundation

- add capability detection
- add semantic theme and symbol layer
- add human renderer primitives
- preserve exact `--json` behavior
- add VHS scaffolding and one README-quality demo tape

### Phase 2: Static surface upgrade

- `sources`
- `status`
- `data list`
- `data show`
- `connect` no-source guided entrypoint
- embed at least one generated VHS SVG in the README

### Phase 3: Connect flow narrative

- phase rendering
- spinner/checkmark transitions
- trust framing
- prompt migration
- success summary and next-step polish

### Phase 4: Runtime event enrichment

- structured progress events
- count updates
- richer completion metadata for summaries

### Phase 5: Hardening and review

- compatibility downgrade pass
- transcript tests
- VHS recordings for review
- acceptance testing on:
  - macOS Homebrew install
  - Linux installer path
  - SSH/tmux if possible

## Testing Strategy

Beauty work should be tested at three levels.

### 1. Snapshot/transcript tests

Golden transcript tests for:

- `status`
- `sources`
- `connect` happy path
- `connect` local-only success
- `connect` needs input
- `connect` legacy/manual
- `data show`

### 2. JSON contract tests

Explicit regression tests that beauty work does not affect:

- event names
- event fields
- exit codes

### 3. Recorded review artifacts

Use terminal recordings for human review:

- VHS or equivalent
- one tape per key journey

This matters because terminal beauty is hard to review from code alone.

## The Next Four Concrete Tasks

From the current branch state, do these next:

1. Add a deterministic successful `connect` fixture and README-quality tape
   that shows real progress and a real success moment.
2. Make the post-success loop feel complete:
   - strengthen `connect` success summary
   - strengthen `vana data show`
   - strengthen `vana status`
3. Add broader transcript and acceptance coverage across migrated, legacy, and
   unsupported connector flows.
4. Then start the deep beauty pass on static surfaces before touching the
   long-running `connect` narrative again.

That sequence gives the highest user-visible value from the current branch
state while keeping release cycles efficient.

## Final Standard

The final beauty bar is not:

- “the CLI looks fancy”

It is:

- the first command feels obvious
- the connect flow feels calm and trustworthy
- success feels earned
- failure feels understandable
- the CLI remains composable
- the machine contract stays pristine

If those are true, `vana` will feel much closer to the best references than it
does now, without turning into a fragile terminal toy.
