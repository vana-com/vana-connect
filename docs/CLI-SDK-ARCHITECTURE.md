# `vana-connect` CLI / SDK Architecture

_As of March 12, 2026_

## Purpose

This document defines the intended architecture for the first version of `vana-connect`, with enough structure to support:

- a strong MVP CLI
- a shared SDK/core
- future runtime backends beyond Playwright
- future Personal Server targets beyond local desktop

It is intentionally focused on what matters now.

## Architectural goals

- one product surface
- one shared core
- one CLI built on top of that core
- runtime abstraction from the start
- simple defaults in v1

## Product shape

`vana-connect` should be treated as one system with layered responsibilities:

- core types, state, and contracts
- runtime orchestration SDK
- CLI presentation layer

This can live comfortably in a monorepo later, but the architecture should be clean regardless of repo layout.

## Recommended package boundaries

### `connect-core`

Purpose:

- shared types
- state models
- outcome models
- event schemas
- config parsing
- error types

This package should have no scraping-backend dependency.

### `connect-sdk`

Purpose:

- source resolution
- connect lifecycle orchestration
- status inspection
- Personal Server target detection
- ingest orchestration
- runtime selection

This is the main programmatic surface the CLI should use.

### `connect-cli`

Purpose:

- command grammar
- prompts
- human-readable formatting
- JSON mode output
- log-path surfacing

The CLI should be thin. It should not own core business logic.

### Later runtime packages

Potential future packages:

- `connect-runtime-playwright`
- `connect-runtime-embrowse`
- `connect-runtime-native-webview`

These should remain internal or semi-internal at first unless there is a strong reason to expose them publicly.

## v1 runtime architecture

### Core principle

The CLI/SDK should depend on a connector execution interface, not directly on Playwright-specific product semantics.

### v1 default runtime

The v1 runtime should be:

- managed by Vana
- Playwright-based
- isolated by default
- headless-first
- capable of escalating to headed mode when needed

### Why this is the right default

- best reproducibility
- best supportability
- easiest first-run experience
- easiest to reason about local state

## Runtime interface

The runtime abstraction should answer:

- can this source run?
- can this source request input?
- can this source escalate to headed mode?
- where are logs and artifacts?
- what profile strategy is active?

Illustrative shape:

```ts
interface ConnectorRuntime {
  kind: string;
  ensureInstalled(): Promise<void>;
  isInstalled(): Promise<boolean>;
  run(request: RunRequest): AsyncIterable<RuntimeEvent>;
  supportsHeaded(): boolean;
  supportsManagedProfiles(): boolean;
}
```

This is not final API design. It is the architectural boundary that matters.

## Profile strategy

This should be treated as a distinct concern from runtime.

### v1 default

- Vana-managed isolated profile

### Why

- avoids cross-browser lock issues
- avoids corrupting user profiles
- keeps sessions reproducible
- easier to debug and support

### Future profile strategies

- existing browser profile
- ephemeral isolated profile
- hardened sandbox profile

These should be future extension points, not v1 onboarding decisions.

## Headed vs headless

### v1 stance

- default: headless
- fallback: headed when required or explicitly requested

### Why

- some login flows require visible interaction
- anti-bot / CAPTCHA flows may need it
- preserving this capability avoids over-constraining the product

### Product implication

The CLI should be able to express:

- running headless
- escalating to headed mode
- failing in `--no-input` mode when headed/manual interaction is required

## Dependency model

### v1 recommendation

Do not make Playwright a user-facing peer dependency.

The user should not have to reason about:

- installing Playwright themselves
- matching Playwright versions
- wiring runner dependencies manually

### Instead

- Vana manages runtime provisioning
- setup/install flow provisions the required runtime
- CLI and SDK treat the runtime as an implementation detail

### Why

- peer dependencies are bad onboarding
- they leak internals into the product surface
- they make the first-run experience feel unfinished

## Existing system compatibility

The architecture should preserve room for:

- current Playwright runner flow
- existing connector scripts
- current local browser-profile/session model
- future Personal Server ingest support

It should also avoid making future compatibility impossible with:

- alternative execution backends
- agent-driven browser environments
- hosted scraping environments

## Personal Server architecture boundary

The CLI and SDK should treat the Personal Server as a target environment, not a scraping runtime concern.

That means:

- collection runtime decides how data is extracted
- ingest layer decides how data is delivered to the active Personal Server
- status layer reports whether ingest succeeded

This keeps the model clean as Personal Server targets evolve:

- local desktop-bundled
- self-hosted
- cloud-hosted

## Logging and artifact strategy

The system should preserve full logs and artifacts even when primary output is compact.

### v1 rule

- compact primary output
- full logs available on disk
- stable paths surfaced when useful

This should apply to:

- setup
- connector runs
- validation
- ingest attempts

This serves both humans and agents without polluting the main UX.

## What is fixed in v1

- managed runtime
- Playwright-backed execution
- isolated profile by default
- headless-first behavior
- headed fallback capability

## What is intentionally left flexible

- alternate runtimes
- alternate profile strategies
- local vs cloud Personal Server targets
- future richer interactive surfaces

## Conclusion

The right v1 architecture is:

- TypeScript-based
- core + SDK + CLI layered cleanly
- runtime-abstracted
- managed-runtime by default
- isolated-profile by default
- headless-first with headed fallback

That gives you the fastest path to a strong MVP without trapping the product in Playwright-specific or desktop-only assumptions.
