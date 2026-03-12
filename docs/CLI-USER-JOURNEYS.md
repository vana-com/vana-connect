# `vana-connect` CLI User Journeys

_As of March 12, 2026_

## Purpose

This document defines the canonical user journeys that should shape the first version of the `vana connect` CLI.

The goal is not to cover every future capability. The goal is to make the first impression feel:

- fast
- trustworthy
- obvious
- composable

These journeys should drive command design, output modes, and sequencing.

## Product stance

For MVP:

- the canonical command form is `vana connect ...`
- the canonical first command is `vana connect <source>`
- `setup` exists, but should not be the primary onboarding path
- the CLI should auto-detect missing runtime/setup during `connect`
- the ideal success state is data synced into the Personal Server
- the acceptable MVP success state is data collected locally with a clear status and next step

## Journey 1: First-time connect of one source

This is the most important journey in the product. It should receive disproportionate design effort.

### Scenario

The user has heard about Vana Connect and wants to connect one source quickly from the terminal.

Example:

```bash
vana connect steam
```

### Starting state

- `vana connect` CLI is installed or otherwise runnable
- local runtime may or may not be installed
- no assumption that Data Connect desktop is installed
- user may or may not have a Personal Server running

### Happy path

1. User runs `vana connect steam`
2. CLI checks local prerequisites
3. If runtime is missing, CLI explains what it will install locally and asks once
4. CLI installs or verifies runtime automatically
5. CLI fetches the Steam connector
6. CLI checks for existing session state
7. CLI runs the connector
8. If credentials or 2FA are needed, CLI asks cleanly
9. CLI collects data
10. If Personal Server is available, CLI ingests data
11. CLI prints a human summary of what was collected
12. CLI prints the next useful step

### Success state

Preferred:

- source is connected
- data is stored in the Personal Server
- user understands what was collected

Acceptable MVP fallback:

- source is connected
- data is stored locally
- user understands where it is and how to use it next

### What makes this journey feel world-class

- user does not need to run `setup` manually
- trust boundaries are explicit
- install actions are obvious before they happen
- auth prompts are minimal and legible
- success is summarized in user terms, not file terms
- next step is obvious

### Failure branches that must be designed

- runtime install fails
- connector does not exist
- login fails
- site flow changed
- Personal Server unavailable
- partial data collected

## Journey 2: Inspect current status

This is the most important trust and recovery journey after first run.

### Scenario

The user wants to know what is installed, connected, and usable.

Example:

```bash
vana connect status
```

### Starting state

- runtime may or may not be installed
- some connectors may be installed
- some sessions may exist
- some results may only be local
- Personal Server may or may not be available

### Happy path

The command should answer, at minimum:

- is runtime installed?
- is Personal Server reachable?
- which connectors are installed?
- which connectors have saved auth/session state?
- what was the last successful run per source?
- was data only collected locally or also ingested?

### Success state

The user can tell, without reading docs:

- whether the system is healthy
- whether a source is connected
- whether data is already usable
- what needs attention

### Why this matters

Without this command, the product will feel fragile even if the underlying runtime is good.

## Journey 3: Reconnect or re-auth a source

### Scenario

A source was connected before, but the session expired or sync failed.

Example:

```bash
vana connect steam
```

or later:

```bash
vana connect reconnect steam
```

### Starting state

- connector is already installed
- cached session may exist but be invalid
- user wants the shortest path back to healthy

### Happy path

1. CLI detects installed connector and existing state
2. CLI attempts reuse of saved session
3. If session is invalid, CLI explains that re-auth is needed
4. CLI prompts only for the missing auth input
5. CLI reruns collection
6. CLI reports the new success state

### Success state

- user is back to a working connected state quickly
- re-auth feels like repair, not a full restart

### Design note

For MVP, this can be the same command as `vana connect <source>`. It does not need a separate noun on day one if the behavior is clear.

## Journey 4: Discover what can be connected

### Scenario

The user wants to see which sources are supported.

Example:

```bash
vana connect list
```

### Starting state

- user may know one source or none

### Happy path

The command shows:

- supported connectors
- whether each is installed locally
- whether each has been connected before
- possibly a small “recommended/common” grouping

### Success state

- user can choose what to connect next
- discovery feels intentional rather than hidden in docs

### Design note

For MVP, this can be simple. It does not need marketplace-level polish, but it does need to exist.

## Journey 5: Use the data after connection

### Scenario

The user has connected a source and wants to know what to do next.

### Starting state

- data has been collected locally or ingested to Personal Server

### Happy path

The CLI should make one of these next states obvious:

- data is available in the Personal Server
- data is available in a local result artifact
- data can be inspected or exported

### Success state

The user feels that connection was not the end goal; it unlocked an immediate next action.

### Design note

For MVP, a short post-success hint is enough. This does not require a large feature surface yet.

## What is explicitly not a core MVP journey

These matter later, but should not dominate v1 design:

- connect every possible source automatically
- scheduling and background sync
- full TUI experience
- multi-machine sync
- advanced app permission workflows
- blockchain / token use cases

Those are important future surfaces, but they should not dilute the first-run experience.

## MVP priority order

1. First-time connect of one source
2. Inspect current status
3. Reconnect / re-auth
4. Discover available sources
5. Post-connect next step

If the first two are excellent, the MVP can leave a very strong impression even if the rest are still thin.
