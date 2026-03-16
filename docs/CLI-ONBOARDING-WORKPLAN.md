# `vana-connect` CLI Onboarding Workplan

_As of March 12, 2026_

## Why this exists

The current `vana-connect` flow is operationally real, but the experience is still "skill-driven" rather than "product-driven." This document defines how to approach the CLI intentionally so it can serve two audiences well:

- humans using the terminal directly
- coding agents like Codex and Claude Code

The goal is not to design two separate products. The goal is to design one command surface with excellent defaults, clear machine-readable behavior, and an onboarding path that reaches first value in under five minutes.

## What we already have

These are not small assets. They should be treated as the foundation, not throwaway prototypes.

### Operational building blocks already present

- one-shot setup flow in [SETUP.md](https://github.com/vana-com/data-connectors/blob/main/skills/vana-connect/SETUP.md)
- connector discovery in `skills/vana-connect/scripts/fetch-connector.cjs`
- execution wrapper in `skills/vana-connect/scripts/run-connector.cjs`
- validator in `skills/vana-connect/scripts/validate.cjs`
- scaffold / schema / register scripts for connector creation
- a clear result artifact at `~/.dataconnect/last-result.json`
- a durable local state model in `~/.dataconnect/`
- a documented runner interaction model based on:
  - progress events
  - `requestInput`
  - explicit exit codes
  - file-based interactive continuation

### Product truths already visible in the current design

- local-first matters
- credentials staying on device matters
- connectors are failure-prone and need diagnostics
- data output needs to be composable
- onboarding success is "data collected and understandable"

This means the hard problem is no longer "can this work?" It is "what command model and first-run flow best expresses what already works?"

## The central design problem

You are not designing a generic scraping CLI. You are designing a local data ingestion runtime for builders.

That creates a dual-audience requirement:

- humans need trust, guidance, and visibility
- agents need token-efficient commands, deterministic output, and minimal ambiguity

The correct response is usually **one interface with two output behaviors**, not two completely separate interfaces.

## Working thesis

`vana-connect` should be:

- SDK-first
- CLI-second
- interactive when useful
- scriptable by default
- local-state aware
- optimized around onboarding and repeat sync

The CLI should expose the same underlying lifecycle to both humans and agents. The difference should mostly be in:

- output formatting
- prompting behavior
- verbosity level
- serialization mode

Not in command taxonomy.

## First design decision to settle

Before command names, settle the primary onboarding journey.

### The ideal first-run journey

For a new user, the CLI should answer these questions in order:

1. What is this and why should I trust it?
2. What will it install or write locally?
3. Which sources can it connect?
4. What is the shortest path to getting my first data in?
5. Where did the data go?
6. What do I do next with it?

If those six questions are answered cleanly, the CLI will feel much more like `uv` or Vercel.

## The main thoughtwork we need

This is the minimum useful sequence. Do not jump straight to command implementation.

### 1. Define the canonical user journeys

Write the top 3 to 5 journeys in concrete step form.

The most important ones are:

- first-time setup via CLI
- connect one source now
- connect all defaults
- inspect what was collected
- re-run / sync later
- recover from auth failure
- add a non-default connector

Each journey should specify:

- starting state
- user intent
- happy path
- failure branches
- end state

This should be the anchor artifact for everything else.

### 2. Define the audience contract

Write down exactly what must be true for:

- humans
- coding agents

For humans, examples:

- natural command discovery
- clear progress
- obvious trust boundaries
- helpful next steps

For agents, examples:

- machine-readable output
- stable field names
- deterministic exit codes
- low-token responses
- no surprise prompts in automation mode

This avoids accidental optimization for one audience at the expense of the other.

### 3. Define the single command grammar

Only after the user journeys are clear should command design start.

The command grammar should answer:

- what are the top-level nouns or verbs?
- what is the default command?
- what is the shortest common invocation?
- where do advanced operations live?

This is where `gh` and `uv` are good references.

### 4. Define the mode model

This is probably the real solution to the human/agent split.

Instead of two CLIs, define modes such as:

- default mode: human-friendly
- `--json`: machine-readable
- `--quiet`: minimal chatter
- `--yes`: non-interactive approval
- `--no-input`: fail instead of prompting

Possibly also:

- `--agent` if there is meaningful behavior beyond `--json`

But this should only exist if it changes semantics in a useful, principled way. A dedicated `--agent` flag should not become a dumping ground for "make it weird for LLMs."

### 5. Define onboarding states and artifacts

Map the local state explicitly:

- install state
- auth/session state per connector
- last run state
- result artifact locations
- logs / screenshots / debug artifacts

Then design commands that expose this state simply.

If users cannot answer "what has been installed, connected, and collected?" the CLI will not feel trustworthy.

### 6. Define failure UX before polishing happy paths

This product lives or dies on graceful failure.

Document the primary failure classes:

- missing setup
- connector not found
- login expired
- site changed
- anti-bot / CAPTCHA
- partial collection
- schema validation failure

For each, define:

- exit code
- stderr message
- suggested fix
- whether retry is safe

## Recommended organization

Yes, use `.md` files. Keep them small, opinionated, and decision-oriented.

Recommended working set:

- `skills/vana-connect/CLI-ONBOARDING-WORKPLAN.md`
  - this file
- `skills/vana-connect/CLI-USER-JOURNEYS.md`
  - concrete step-by-step journeys
- `skills/vana-connect/CLI-AUDIENCE-CONTRACT.md`
  - human vs agent requirements
- `skills/vana-connect/CLI-COMMAND-MODEL.md`
  - command grammar, modes, flags, output conventions
- `skills/vana-connect/CLI-STATE-MODEL.md`
  - local artifacts, sessions, logs, result files
- `skills/vana-connect/CLI-ONBOARDING-COPY.md`
  - actual first-run messages, prompts, help text, examples

Optional later:

- `skills/vana-connect/CLI-V1-SPEC.md`
  - the implementation target after the exploratory docs settle

## What to avoid

Avoid these traps:

- mapping each existing script directly into a public command surface
- designing separate human and agent CLIs
- over-indexing on distant future blockchain/token use cases
- introducing a TUI before proving it helps first-run success
- importing too much Personal Server scope before the connector flow is crisp

Those are all likely to blur the product before the core loop is excellent.

## Scope guidance for future context

Some future context is useful. Too much is distracting.

Useful now:

- the Personal Server is the immediate downstream destination
- permissions and sync will likely matter soon
- local-first trust is central
- richer operations may come later

Not useful for v1 onboarding design:

- tokenization / monetization flows
- broad blockchain integration
- speculative long-range ecosystem surfaces

The scraping-transport work Kahtaf is doing is relevant at the SDK/runtime boundary, but probably not at the CLI grammar boundary. Treat it as a future execution backend, not a reason to redesign onboarding.

## Recommended next sequence

1. Lock the first-run user journeys.
2. Lock the audience contract for human vs agent.
3. Design one command model that serves both.
4. Write the actual onboarding copy and help text.
5. Only then design the SDK and CLI package layout.

That order matters. If you skip the user journeys and jump to code structure, the resulting CLI will likely mirror the current scripts instead of the user experience you want.

## Opinionated conclusion

The right question is not "what commands should `vana-connect` have?"

The right first question is:

**"What exact first-run experience should make both a human and an agent feel: this is obvious, trustworthy, fast, and composable?"**

Once that is written down concretely, the command model becomes much easier.
