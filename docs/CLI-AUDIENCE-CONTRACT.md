# `vana-connect` CLI Audience Contract

_As of March 12, 2026_

## Purpose

This document defines what must be true for the `vana connect` CLI to serve both:

- humans using the terminal directly
- coding agents like Codex and Claude Code

The product should not split into two different CLIs. It should present one command model with mode behavior that works well for both audiences.

## Core decision

`vana connect` should use:

- **one command grammar**
- **one underlying lifecycle**
- **multiple output and prompt modes**

The split between audiences should happen primarily in:

- output formatting
- prompt behavior
- verbosity
- non-interactive guarantees

Not in top-level commands.

## Audience 1: Humans

### What humans need

- commands they can guess
- clean first-run guidance
- clear trust boundaries
- visible progress
- human summaries of success
- direct explanations of failure and recovery

### What must be true in the UX

- the first command should work without reading extensive docs
- install/setup should be explained before any major local changes happen
- credentials should never feel like they are disappearing into a black box
- success should be summarized in plain language
- the user should always know what to do next

### What to avoid for humans

- raw JSON by default
- unexplained artifact paths as the main success message
- ambiguous partial matches without confirmation
- silent fallback behavior
- prompts that assume repo knowledge

## Audience 2: Coding agents

### What agents need

- stable command grammar
- stable exit codes
- stable machine-readable output
- deterministic prompt behavior
- minimal token waste
- no hidden state transitions

### What must be true in the UX

- there must be a machine-readable mode
- stdout/stderr behavior must be predictable
- non-interactive mode must fail instead of hanging
- event types and field names should be stable
- help output and command behavior should be compact and unsurprising

### What to avoid for agents

- decorative output in machine mode
- forced interactive flows when a flag could suppress them
- hidden install side effects without explicit acknowledgement
- inconsistent error shapes
- long prose where structured output is possible

## Shared requirements

These are requirements for both audiences.

### 1. Trust

The CLI must make these things explicit:

- what is being installed
- where state is stored locally
- when credentials are needed
- where data ended up

### 2. Legibility

The CLI must make these things easy to answer:

- what just happened?
- what state am I in now?
- what do I do next?

### 3. Recovery

The CLI must make common failure modes recoverable without reading source code or repo docs.

### 4. Composability

The CLI must support being embedded in:

- shell scripts
- agents
- future desktop or service wrappers

## Proposed mode model

This is the intended starting point for MVP.

### Default mode

Audience:

- humans

Behavior:

- concise human-readable output
- prompts when needed
- clear next-step hints
- summarized success and failure

### `--json`

Audience:

- agents
- scripts
- advanced users

Behavior:

- machine-readable output only
- stable event objects
- no decorative formatting

### `--no-input`

Audience:

- automation
- agents in non-interactive mode

Behavior:

- fail if input is needed
- never block waiting for user input

### `--yes`

Audience:

- automation
- users who want one-shot bootstrap

Behavior:

- auto-approve safe install/setup prompts

### `--quiet`

Audience:

- scripts
- users who want reduced chatter

Behavior:

- reduce non-essential status output
- preserve important warnings/errors

## Why `--json` is probably the key agent mode

At least for MVP, `--json` is likely more important than an `--agent` flag.

Why:

- it is easier to reason about
- it matches strong prior art
- it focuses on contract shape rather than audience labeling
- it avoids creating a second quasi-interface

An explicit `--agent` flag should only be introduced if it adds semantics that cannot be cleanly expressed through:

- `--json`
- `--no-input`
- `--yes`
- `--quiet`

## Output contract expectations

### In human mode

Success should look like:

- source connected
- brief summary of what was collected
- whether data was ingested or only stored locally
- next step

Failure should look like:

- short problem statement
- one suggested fix
- whether retry is safe

### In machine mode

Output should:

- use stable event types
- include stable identifiers and file paths when relevant
- clearly distinguish success, warning, and failure states
- avoid free-form chatter

The existing `run-connector` event model is a strong starting point and should be formalized rather than replaced.

## Command behavior principles

### Principle 1: Same command, different presentation

Example:

```bash
vana connect steam
vana connect steam --json
vana connect steam --json --no-input
```

These should represent the same lifecycle, not different products.

### Principle 2: Auto-do the obvious, but narrate it

If runtime is missing, the CLI can install it as part of `connect`, but it should first explain:

- what is missing
- what it will install
- where it will go

### Principle 3: Never surprise automation

If the caller asked for non-interactive behavior, the CLI must fail clearly instead of waiting for a prompt response indefinitely.

### Principle 4: Success should be outcome-shaped

Do not make the main success story:

- “saved file to X”

Prefer:

- “connected Steam and collected your library and profile”

Then include artifact paths as supporting detail.

## MVP acceptance criteria by audience

### Humans

MVP is acceptable if:

- they can connect one source from one command
- they understand what was installed and where
- they understand what data was collected
- they can check status later without docs

### Agents

MVP is acceptable if:

- they can run one command with stable machine output
- they can detect missing setup cleanly
- they can detect when input is required
- they can distinguish local-only success from Personal Server ingest success

## Conclusion

The key to serving both audiences is not building two interfaces.

It is:

- one command model
- one lifecycle
- one explicit mode system
- one strong machine-readable contract

If those are done well, `vana connect` can feel polished for humans and efficient for coding agents at the same time.
