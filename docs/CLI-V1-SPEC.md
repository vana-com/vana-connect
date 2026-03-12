# `vana-connect` CLI v1 Spec

_As of March 12, 2026_

## Purpose

This document defines the implementation target for the first version of the `vana connect` CLI.

It is intended to be:

- small enough to ship quickly
- strong enough to leave an excellent first impression
- explicit enough to guide implementation decisions

## Product goal

Ship an MVP CLI that feels intentional and trustworthy for both:

- humans using the terminal directly
- coding agents using machine-readable mode

The v1 CLI does not need to feel broad or mature. It does need to feel:

- fast to first value
- clear about what happened
- clear about where data went
- reliable enough to trust

## Product stance

### Core command family

The CLI command family is:

```bash
vana connect ...
```

### Canonical first command

The canonical first command is:

```bash
vana connect <source>
```

Example:

```bash
vana connect steam
```

### Core philosophy

- one command model
- one underlying lifecycle
- human-friendly default mode
- machine-readable mode via flags

## v1 command surface

The public v1 commands are:

- `vana connect <source>`
- `vana connect list`
- `vana connect status`
- `vana connect setup`

Optional if cheap:

- `vana connect inspect <source>`

No additional top-level command surfaces are part of v1.

## v1 flags

Required:

- `--json`
- `--no-input`
- `--yes`

Optional if cheap:

- `--quiet`

## Command behavior

### `vana connect <source>`

#### Goal

Connect one source end-to-end with the shortest possible path to value.

#### Required behavior

1. Check runtime availability.
2. If runtime is missing:
   - explain what will be installed
   - ask for confirmation unless `--yes` is present
   - perform setup inline
3. Resolve the requested source connector.
4. Check for reusable saved session/auth state.
5. Run collection.
6. Prompt for input if required, unless `--no-input` is present.
7. Detect whether a Personal Server target is available.
8. If available, attempt ingest.
9. Print a concise outcome summary.

#### Human-mode output requirements

Must communicate:

- what is being installed, if anything
- what source is being connected
- whether an existing session is being reused
- whether data was collected
- whether data was ingested or saved locally only
- what to do next

#### Machine-mode requirements

Must emit structured events and a final outcome object.

#### Success outcomes

- `connected_and_ingested`
- `connected_local_only`

#### Recoverable outcomes

- `needs_input`
- `setup_required`
- `personal_server_unavailable`
- `auth_failed`
- `connector_unavailable`
- `ingest_failed`

#### Hard failure outcomes

- `runtime_error`
- `invalid_connector`
- `unexpected_internal_error`

### `vana connect list`

#### Goal

Show the sources the user can connect.

#### Required behavior

- list supported sources
- indicate whether each source is installed locally when known
- stay compact in human mode
- return structured output in `--json` mode

### `vana connect status`

#### Goal

Answer the question:

**“Is my setup healthy, and is my data connected and usable?”**

#### Required behavior

Report at minimum:

- runtime installed or not
- Personal Server target available/unavailable/unknown
- installed sources
- likely session presence per source
- last known outcome per source
- local-only vs ingested state per source when known

#### Output requirement

Human mode should be compact and summary-first.

Machine mode should be structured and stable.

### `vana connect setup`

#### Goal

Provide explicit bootstrap and repair.

#### Required behavior

- install runtime prerequisites
- verify key runtime artifacts exist
- summarize what was installed
- exit cleanly if already healthy

#### Product role

This command exists for:

- explicit install
- repair
- CI/bootstrap

It is not the intended first-run entrypoint for humans.

## Mode behavior

### Default mode

- human-readable
- concise
- prompts allowed
- no raw JSON

### `--json`

- structured output only
- no decorative formatting
- stable event and outcome objects

### `--no-input`

- do not prompt
- fail with a structured `needs_input` outcome if input is required

### `--yes`

- auto-approve safe setup/install prompts

### `--quiet`

- reduce non-essential human chatter
- keep warnings and errors

## State model requirements

The CLI must reason about four state domains:

- runtime
- sources
- data
- Personal Server target

### Runtime states

- `installed`
- `missing`
- `unhealthy`

### Source states

- `unknown`
- `available`
- `installed`
- `session_present`
- `needs_auth`
- `last_run_succeeded`
- `last_run_failed`

### Data states

- `none`
- `collected_local`
- `ingested_personal_server`
- `ingest_unavailable`
- `ingest_failed`

### Personal Server target states

- `available`
- `unavailable`
- `unknown`

## Data-location rule

The CLI must never blur:

- successful local collection
- successful Personal Server ingest

This distinction must appear in:

- human success copy
- `status`
- `--json` output

## Personal Server model

In v1, the CLI should speak in terms of:

- the user’s Personal Server

It should not force users to reason about:

- desktop app internals
- localhost implementation details
- cloud-vs-local backend distinctions

The implementation may detect:

- local target
- future self-hosted target
- future cloud-hosted target

But that is an implementation concern, not the user-facing model.

## Machine-readable event contract

v1 should formalize a small event set instead of exposing arbitrary internal messages.

### Required event categories

- setup
- connector resolution
- run lifecycle
- input required
- collection result
- ingest result
- final outcome

### Example event shapes

Illustrative only:

```json
{"type":"setup-check","runtime":"installed"}
{"type":"connector-resolved","source":"steam","connectorPath":"..."}
{"type":"run-started","source":"steam"}
{"type":"needs-input","source":"steam","fields":["username","password"]}
{"type":"collection-complete","source":"steam","resultPath":"..."}
{"type":"ingest-complete","source":"steam","target":"personal_server"}
{"type":"outcome","status":"connected_and_ingested","source":"steam"}
```

The exact field set should be locked during implementation and kept intentionally small.

## Copy requirements

The CLI copy must:

- explain installs before performing them
- state that credentials stay local
- summarize outcomes in user terms
- keep file paths as supporting detail
- clearly distinguish local-only vs ingested outcomes

The copy should stay:

- calm
- concise
- technically serious

## Existing foundations to reuse

The v1 CLI should build on the current primitives rather than replace them outright.

Reuse:

- setup bootstrap behavior
- connector fetch behavior
- runner lifecycle
- request-input continuation model
- local state directory
- validator core where helpful

Wrap:

- raw script names
- raw bootstrap UX
- raw helper output

## MVP non-goals

These are explicitly not required for v1:

- connect-all as the default onboarding flow
- scheduling or daemonized background sync
- TUI-first interaction
- large configuration trees
- advanced Personal Server environment management
- full cloud orchestration UX
- blockchain / token use cases

## Implementation priority

Build in this order:

1. `vana connect <source>`
2. `vana connect status`
3. `vana connect list`
4. `vana connect setup`
5. optional `inspect`

This order matches user impact.

## Acceptance criteria

### Human acceptance

v1 succeeds if a human can:

- run `vana connect steam`
- get setup handled inline if missing
- understand what was installed
- understand what data was collected
- understand whether it was ingested or only saved locally
- run `vana connect status` later and understand their current state

### Agent acceptance

v1 succeeds if an agent can:

- run `vana connect steam --json --no-input`
- detect whether setup is missing
- detect whether input is required
- detect whether collection succeeded
- detect whether ingest succeeded
- distinguish local-only from ingested outcomes

## Conclusion

v1 should be intentionally small and disproportionately focused on first-run quality.

If the CLI can connect one source beautifully, report status honestly, and serve both humans and agents through one stable command model, it will be a strong MVP.
