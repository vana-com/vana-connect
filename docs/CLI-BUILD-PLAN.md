# `vana-connect` CLI Build Plan

_As of March 12, 2026_

## Purpose

This document turns the v1 spec into a concrete implementation sequence and assigns work to the right repositories.

The goal is to move from strategy to build with minimal confusion.

## Repo responsibilities

### `vana-connect`

Primary implementation home for:

- the new shared core
- the new CLI
- the runtime orchestration SDK layer
- future monorepo structure

Why:

- it already has TypeScript SDK infrastructure
- it already uses `pnpm` workspaces
- it is already the public-facing `vana-connect` product repo

Relevant files:

- [package.json](/home/tnunamak/code/vana-connect/package.json)
- [pnpm-workspace.yaml](/home/tnunamak/code/vana-connect/pnpm-workspace.yaml)

### `data-connectors`

Remain the source of truth for:

- connector scripts
- connector registry
- schemas
- current skill docs
- current bootstrap/helper scripts until migrated or wrapped

Relevant files:

- [registry.json](/home/tnunamak/code/data-connectors/registry.json)
- [skills/vana-connect/scripts](/home/tnunamak/code/data-connectors/skills/vana-connect/scripts)

### `data-connect`

Reference implementation and integration source for:

- Personal Server ingest behavior
- desktop app runtime assumptions
- current local execution/ingest patterns

Relevant file:

- [personalServerIngest.ts](/home/tnunamak/code/data-connect/src/services/personalServerIngest.ts)

## Practical conclusion

Build the CLI in `vana-connect`.

Do not move connectors or the skill immediately.

In v1, the new CLI should wrap and reuse parts of the current `data-connectors` runtime flow where sensible, while establishing cleaner package boundaries in `vana-connect`.

## Proposed package shape in `vana-connect`

Initial target:

- `src/core`
  - shared types, outcomes, events, errors
- `src/cli`
  - command handlers, formatters, prompts
- `src/runtime`
  - runtime abstraction and v1 Playwright runtime adapter
- `src/connectors`
  - registry/source resolution helpers
- `src/personal-server`
  - target detection and ingest helpers

If needed later, this can become true workspace packages:

- `packages/connect-core`
- `packages/connect-sdk`
- `packages/connect-cli`
- `packages/connect-runtime-playwright`

For speed, v1 can start inside the existing `src/` tree and split into packages after the flow is proven.

## Why not force workspace packages immediately

Because the real risk is UX and command behavior, not package boundaries.

Start with clean module boundaries inside `vana-connect`. Split into multiple publishable packages only when it helps materially.

## Build phases

### Phase 1: Core contracts

Implement in `vana-connect`:

- outcome types
- event types for `--json`
- state types
- error model
- config paths and log-path helpers

This should be the first code layer because the CLI and SDK will both depend on it.

### Phase 2: Runtime adapter

Implement a v1 runtime adapter around the current Playwright-based flow.

Scope:

- runtime install check
- runtime setup invocation
- connector run invocation
- event normalization from current runner output
- headed fallback support preserved

This layer can initially shell out to existing scripts in `data-connectors` / existing runner artifacts if needed.

### Phase 3: Connector resolution

Implement:

- source lookup
- list command data source
- connector fetch/wrap behavior

For v1, this can reuse existing registry and download logic rather than replacing it from scratch.

### Phase 4: Personal Server target detection and ingest

Implement:

- Personal Server availability detection
- ingest attempt when target is available
- explicit local-only vs ingested outcomes

For v1, keep this small and honest.

### Phase 5: CLI command handlers

Implement:

- `vana connect <source>`
- `vana connect status`
- `vana connect list`
- `vana connect setup`

Plus:

- `--json`
- `--no-input`
- `--yes`

### Phase 6: Human-mode polish

Implement:

- onboarding copy from the copy doc
- compact progress formatting
- log-path surfacing
- concise success/failure summaries

This phase matters more than it sounds. It is where the CLI stops feeling like a wrapper.

### Phase 7: Tests

Add tests for:

- command parsing
- outcome/event normalization
- `--json` output contract
- `--no-input` behavior
- local-only vs ingested outcome distinction

Focus on contract tests first, not deep end-to-end coverage.

## Concrete first implementation slice

The first shippable slice should be:

1. `vana connect steam`
2. inline setup if missing
3. connector resolution
4. run via existing runtime
5. JSON event output
6. human summary
7. `vana connect status`

That slice is enough to validate the architecture and the first-run UX.

## Likely technical choices in `vana-connect`

- TypeScript
- Node runtime
- `commander` for command grammar
- `@inquirer/prompts` for interactive input
- `zod` for event/state validation
- file-backed logs under `~/.dataconnect/logs`

These choices match the current system boundary and optimize for speed.

## What not to build first

Do not start with:

- a TUI
- multi-runtime plugin marketplace
- full package splitting ceremony
- connect-all onboarding
- scheduling
- broad environment management

Those would slow down the MVP and dilute the first-run quality bar.

## Immediate next coding steps

1. Create CLI/core/runtime module skeleton in `vana-connect`.
2. Add command parser and placeholder commands.
3. Implement core types and event contract.
4. Wrap current runtime/setup/connector resolution behavior.
5. Implement `vana connect <source>` happy path.
6. Implement `status`.
7. Add tests for the contract and modes.

## Decision summary

- Build in `vana-connect`
- Reuse `data-connectors` assets rather than moving them now
- Keep `data-connect` as reference for Personal Server ingest behavior
- Optimize for one excellent source-connect flow first
- Delay broader repo/package reorganization until the flow is proven

## Conclusion

The next work should be code in `vana-connect`, not more product exploration.

The MVP path is:

- thin architecture
- strong contracts
- one polished connect flow
- one honest status command
