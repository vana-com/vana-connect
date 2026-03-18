# `vana-connect` CLI Command Model

_As of March 12, 2026_

## Purpose

This document defines the intended command surface for the first version of the `vana connect` CLI.

It is optimized for:

- excellent first-run onboarding
- one command model for humans and coding agents
- fast MVP delivery using existing runtime primitives
- future support for local and cloud Personal Server environments

## Product stance

The CLI should feel like one coherent product, not a bundle of repo scripts.

That means:

- public commands should be user-journey shaped
- internal scripts should remain implementation details
- the command surface should be small in v1

## Command namespace

Assume the CLI command family is:

```bash
vana connect ...
```

This keeps the door open for a broader `vana` command family while making “connect” the product surface for data portability.

## MVP top-level commands

For v1, the public surface should be limited to:

- `vana connect <source>`
- `vana connect list`
- `vana connect status`
- `vana connect setup`

Optional for v1 if it is cheap:

- `vana connect inspect <source>`

Not v1:

- large TUI mode
- scheduling
- “connect everything” as the default first-run path
- extensive admin/config subtrees

## Canonical first command

The canonical first command should be:

```bash
vana connect <source>
```

Example:

```bash
vana connect steam
```

Why:

- it matches the user’s intent directly
- it reduces onboarding ceremony
- it allows the CLI to inline setup when safe
- it creates a more Vercel/`uv`-like first impression than forcing `setup`

## Command details

### `vana connect <source>`

Primary job:

- connect one source end-to-end

Expected behavior:

1. validate CLI/runtime prerequisites
2. if needed, explain and perform setup
3. fetch or resolve the connector
4. check existing auth/session state
5. run collection
6. request input if needed
7. ingest to the active Personal Server if available
8. summarize outcome

Expected output in human mode:

- what is happening
- what, if anything, is being installed
- whether existing session is being reused
- what data was collected
- whether data was ingested or only stored locally
- what to do next

Expected output in machine mode:

- stable event objects
- stable outcome state
- stable indication of whether ingest occurred

### `vana connect list`

Primary job:

- show what can be connected

Expected behavior:

- list known/supported sources
- indicate installed/not installed
- optionally indicate previously connected

This command should stay simple in v1.

### `vana connect status`

Primary job:

- show the current health and state of the local setup

Expected behavior:

- report runtime installation status
- report active Personal Server target status
- report installed connectors
- report saved session presence
- report recent run outcomes
- report local-only vs ingested state when known

This is the key trust/recovery command.

### `vana connect setup`

Primary job:

- explicit bootstrap / repair / preinstall

Expected behavior:

- install runtime prerequisites
- verify expected artifacts exist
- explain what was installed

Important:

- this should exist
- but it should not be the default onboarding path

## Optional v1 command

### `vana connect inspect <source>`

Primary job:

- inspect detailed status for one source

Possible output:

- connector installed?
- session present?
- last successful run?
- last error?
- last known scopes collected?
- last result path?

This is useful, but `status` matters more.

## Mode model

The mode model should be flag-based, not command-based.

### Required flags

- `--json`
- `--no-input`
- `--yes`

Likely useful:

- `--quiet`

### Behavior expectations

#### Human default

- concise human-readable output
- safe prompts allowed
- progress visible
- summarized outcome

#### `--json`

- no decorative output
- stable machine-readable events/results

#### `--no-input`

- do not prompt
- fail clearly if input is required

#### `--yes`

- auto-approve safe setup/install confirmations

## Environment model

The CLI should be environment-aware from the beginning, even if v1 only supports a narrow subset.

### Concept

Users should think:

- “I have a Personal Server”

Not:

- “I have to reason about desktop app internals vs cloud infra internals”

### Minimal MVP environment vocabulary

The CLI should understand:

- active Personal Server target available or unavailable
- local-only data collection vs ingested data

Possible future targets:

- local desktop-bundled Personal Server
- self-hosted Personal Server
- cloud-hosted Personal Server

For v1, do not expose a large environment-management surface. Just make sure commands and status output do not assume localhost forever.

## State model expectations

The command surface depends on a small number of visible states.

### Runtime state

- installed
- missing
- unhealthy

### Source state

- known
- installed
- authenticated/session-present
- needs re-auth
- run succeeded
- run failed

### Data state

- collected locally
- ingested to Personal Server
- ingest unavailable
- ingest failed

These states should show up explicitly in status and machine-readable output.

## Outcome model for `connect`

This is important for both UX and SDK design.

### Success classes

- `connected_and_ingested`
- `connected_local_only`

### Recoverable failure classes

- `needs_input`
- `setup_required`
- `personal_server_unavailable`
- `auth_failed`
- `connector_unavailable`
- `ingest_failed`

### Hard failure classes

- `runtime_error`
- `invalid_connector`
- `unexpected_internal_error`

These names do not need to be final, but the CLI should think in this shape.

## How this maps to current primitives

The existing scripts already provide useful internals:

- setup bootstrap
- connector fetch
- connector run lifecycle
- validation

The CLI should wrap those behaviors, not expose them raw.

Rough mapping:

- `vana connect setup`
  - wraps current setup script behavior
- `vana connect <source>`
  - wraps connector fetch + run + ingest
- `vana connect status`
  - wraps local state inspection
- `vana connect list`
  - wraps registry/discovery behavior

## What to defer

To keep MVP sharp, defer:

- multi-step onboarding wizards
- full source marketplace UX
- scheduling and daemonization
- bulk connect-all default flow
- broad config management trees
- TUI-first interaction

These may be useful later, but they are not necessary to create a strong first impression now.

## Conclusion

The MVP command surface should be intentionally small:

- connect one source
- list sources
- inspect status
- run setup explicitly when desired

That is enough to ship quickly while still creating a product surface that feels deliberate, modern, and extensible.
