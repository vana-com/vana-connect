# `vana-connect` CLI Foundation Assessment

_As of March 12, 2026_

## Executive summary

The current `vana-connect` foundation is real. It is not just hand-wavy prototype text. There is a working setup path, a working runner interaction model, a working connector fetch path, a working validator, and a working output contract.

But compared against the best prior art in CLI and SDK UX, the current state is closer to:

- **strong internal tooling**
- **promising runtime architecture**
- **weak product shell**

That is a good starting point for shipping an MVP quickly, because the engine is more real than the surface. The risk is not "this is fake." The risk is "if we ship this mostly as-is, it will feel improvised rather than world-class."

## Rating summary

Scored against the standards implied by `uv`, `gh`, Vercel CLI, Stripe DX, and the product goals in the PRD.

| Component                    | Current rating | Why                                                                         |
| :--------------------------- | :------------- | :-------------------------------------------------------------------------- |
| Setup flow                   | C+             | Functional, but reads like bootstrap ops                                    |
| Local state model            | B              | Coherent and understandable, good foundation                                |
| Runner protocol              | B+             | Strongest asset; supports both human and agent flows                        |
| Validator                    | B-             | Valuable internal quality gate, not yet polished user-facing diagnostics    |
| Connector discovery          | C              | Works, but weak discoverability and trust UX                                |
| Result contract              | B-             | Directionally good, still under-specified as a public SDK contract          |
| Overall onboarding readiness | C+             | Can work, but not yet likely to create a `uv`/Vercel-level first impression |

## What is genuinely real and reusable

### 1. Runner protocol

The best part of the current system is [run-connector.cjs](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs).

What is strong:

- explicit event types on stdout
- explicit exit codes
- machine-readable output by default
- optional human-readable output via `--pretty`
- input continuation model using files instead of forced restarts

Relevant code:

- usage and event framing at [run-connector.cjs:3](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs#L3)
- output contract at [run-connector.cjs:13](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs#L13)
- human-readable formatting at [run-connector.cjs:72](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs#L72)
- request-input handling at [run-connector.cjs:196](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs#L196)
- file-based continuation at [run-connector.cjs:214](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/run-connector.cjs#L214)

Why this matters:

- this is the core reason a single CLI can serve both humans and coding agents
- it already encodes the right architectural instinct: one lifecycle, multiple presentations

Compared to prior art:

- not as refined as Stripe CLI or `gh`
- but architecturally stronger than a lot of one-off CLIs because it already thinks in events, modes, and resumability

Verdict:

- keep this
- formalize it
- build the new CLI around it

### 2. Local state model

The current `~/.vana/` layout is a meaningful asset.

What is good:

- runner location
- connector cache
- persistent browser profiles
- single obvious last-result artifact

Relevant docs:

- [SETUP.md](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/SETUP.md)

Why this matters:

- world-class CLIs make state legible
- Vercel, Supabase, and Doppler all benefit from explicit local context

Current limitations:

- state is documented, but not yet exposed through a coherent CLI surface
- there is no `status`, `doctor`, `inspect`, or `auth list` kind of command

Verdict:

- keep the state model
- make it visible and inspectable

### 3. Validator

The validator is more substantial than a vibe-coded placeholder.

Relevant code:

- report model at [validate.cjs:23](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/validate.cjs#L23)
- metadata checks at [validate.cjs:185](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/validate.cjs#L185)
- script pattern checks at [validate.cjs:227](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/validate.cjs#L227)

Why it matters:

- quality gates are one of the strongest things you can borrow from Stripe-style DX
- the system already has a place where correctness can accumulate

Current limitation:

- it is aimed primarily at connector creators, not end users
- it needs better categorization, remediation guidance, and friendlier summaries

Verdict:

- keep it
- evolve it into the nucleus of `doctor`, `inspect`, and trust/debug surfaces

## What currently feels improvised

### 1. Setup flow

[setup.sh](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/setup.sh) is useful but nowhere near `uv` / Vercel quality.

Relevant code:

- bootstrap flow at [setup.sh:19](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/setup.sh#L19)
- cross-repo clone at [setup.sh:27](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/setup.sh#L27)
- dependency install at [setup.sh:35](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/setup.sh#L35)
- browser install at [setup.sh:38](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/setup.sh#L38)

What’s weak:

- no single packaged install artifact
- no versioned install / upgrade story
- no environment detection beyond "try it"
- no polished failure recovery
- no clear explanation of local state after install
- no post-install success verification beyond file existence

Compared to prior art:

- `uv` compresses install + usage into a nearly frictionless mental model
- Vercel turns first run into a guided, trustworthy workflow
- current setup feels like a repo maintenance script

Verdict:

- do not expose this as the final product onboarding
- it is acceptable as an internal bootstrap while a real CLI installer is built

### 2. Connector discovery

[fetch-connector.cjs](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/fetch-connector.cjs) works, but it is not yet a strong user-facing discovery experience.

Relevant code:

- raw GitHub registry fetch at [fetch-connector.cjs:24](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/fetch-connector.cjs#L24)
- partial match search at [fetch-connector.cjs:57](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/fetch-connector.cjs#L57)
- download flow at [fetch-connector.cjs:70](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/scripts/fetch-connector.cjs#L70)

What’s weak:

- ambiguous partial matching
- no browse/list/search UX
- no confidence signals
- no versioning or channel model
- no checksum or authenticity UX at the command surface

Compared to prior art:

- `gh` and Vercel make context clear before acting
- this currently behaves more like a private helper utility

Verdict:

- keep the logic
- replace the product surface around it

### 3. Result contract

The scoped result format is good enough to build on, but not fully mature.

Strengths:

- composable
- reasonably simple
- aligns with Personal Server storage by scope

Weaknesses:

- needs a tighter public contract
- unclear semantics for partial success
- unclear long-term metadata conventions
- not yet expressed as a formal SDK boundary

Verdict:

- keep the scoped model
- formalize types and lifecycle semantics in the SDK

## Assessment against product goals

### Fast to first value

Current state: **partially met**

Why:

- the mechanics exist
- the journey still has too much "read docs, run setup script, fetch connector, run wrapper, understand files"

This is not a five-minute magic experience yet.

### Invisible once running

Current state: **not yet met**

Why:

- no first-class sync/schedule story
- no polished re-auth loop
- no status surface

### Trustworthy data

Current state: **partially met**

Why:

- local-first helps
- validator helps
- but the UX does not yet make provenance, freshness, and success status legible enough

### Composable output

Current state: **mostly met**

Why:

- structured JSON exists
- scoped keys are useful
- the runner already thinks in events

This is one of the strongest areas.

### Graceful failure

Current state: **mixed**

Why:

- the protocol has the bones
- the user-facing remediation layer is still thin

## What `vana-com/vana-connect` changes

Public repo reference:

- https://github.com/vana-com/vana-connect

As of March 12, 2026, the public `vana-connect` repo presents itself as a **Vana Connect SDK** focused on app-side session creation, grant handling, and Personal Server data access.

What that means for this CLI work:

- it is **not** the same thing as the local connector runner / headless scraping CLI
- but it provides a very useful future boundary

The likely product split is:

- **local collection runtime / CLI**
  - setup
  - connector install
  - connect / sync / auth / inspect
  - local result and Personal Server population
- **app-facing SDK**
  - create sessions
  - request scopes
  - poll grants
  - fetch granted data

This is good news. It means the CLI does not need to absorb all SDK responsibilities. It can be excellent at collection and local orchestration while the public app SDK handles the developer integration side.

The key caution:

- do not let the existence of the SDK muddy the CLI’s first-run story
- the CLI should still optimize around "get my data in locally fast"

## How to get an MVP out quickly without blowing first impression

This is the most important practical question.

### Core principle

Do **not** try to make the MVP complete.

Do make the MVP feel:

- intentional
- trustworthy
- fast
- legible

That is enough to leave an excellent impression even if deeper features are missing.

### The fastest credible MVP

Build a thin product shell over the current primitives.

That MVP should focus only on:

- install
- connect one source
- list available sources
- inspect local status
- re-auth / reconnect
- clear machine-readable mode

Not on:

- full TUI
- full scheduling
- full multi-environment sync
- advanced Personal Server operations
- long-range blockchain/token use cases

### MVP qualities that matter disproportionately

#### 1. One obvious first command

Examples:

- `vana-connect setup`
- `vana-connect connect steam`

The user should not need to learn the internal script model.

#### 2. One excellent happy path

The first run should be highly polished for:

- install if missing
- explain what will be installed
- fetch connector
- run connector
- request credentials only if needed
- summarize what was collected
- say what to do next

One journey polished deeply beats ten half-finished commands.

#### 3. One strong machine-readable mode

Agents need:

- `--json`
- stable event types
- stable exit codes
- no surprise prompts when non-interactive

You already have much of this. Preserve it.

#### 4. One clear trust message

The first-run copy should make three things explicit:

- credentials stay local
- what gets installed locally
- where the data is stored

That alone will materially improve onboarding.

#### 5. One basic diagnostics surface

Even for MVP, ship a minimal:

- `vana-connect status`

It should answer:

- installed or not
- connectors present
- sessions present
- last run result
- last error if known

This is cheap and high leverage.

## Recommended MVP line

If speed matters, the target should be:

### MVP v1

- `vana-connect setup`
- `vana-connect list`
- `vana-connect connect <source>`
- `vana-connect status`
- `vana-connect inspect <source>` or `vana-connect logs <source>`
- `--json`
- `--yes`
- `--no-input`

Backed initially by the existing scripts and runtime.

### Defer to v1.1+

- scheduling
- bulk connect all
- richer auth/session management
- doctor / repair
- richer sync to Personal Server
- interactive/TUI mode

This gets you to a productized MVP quickly without pretending the system is complete.

## Confidence: how much can we confidently initialize now?

Quite a lot, if you are disciplined about scope.

You can confidently initialize a world-class trajectory now by locking:

- the first-run journey
- the command grammar
- the mode model for human vs agent
- the trust copy
- the local state visibility model

You do **not** need to solve every future feature to do that well.

In other words:

- you can absolutely ship an MVP soon
- and still strongly influence whether the product later feels `uv`/Vercel-like or forever patched together

The risk is not moving too early. The risk is exposing raw primitives before the first-run experience is designed.

## What to keep, what to replace

Keep:

- runner event model
- requestInput continuation model
- local state layout
- validator core
- scoped result approach

Replace or wrap:

- setup bootstrap UX
- direct script-oriented command surface
- connector discovery UX
- user-facing diagnostics UX
- first-run copy and help model

## Conclusion

The current foundation is strong enough to justify confidence, but not strong enough to ship as a polished CLI without a product pass.

The correct strategy is:

- treat the current scripts and contracts as the engine
- build a thin but very intentional CLI shell for MVP
- optimize the first-run journey ruthlessly
- keep agent and human support within one command model via output and prompt modes

That path is both the fastest route to MVP and the best route to a long-term world-class UX.
