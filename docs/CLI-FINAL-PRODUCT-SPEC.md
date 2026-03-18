# `vana-connect` Final Product Spec

_As of March 13, 2026_

If this document conflicts with earlier `CLI-*` planning docs, this document wins.

## Purpose

This document defines the target end state for:

- the `vana` CLI
- the local connector runtime
- the installer and release pipeline
- the skill/onboarding contract that should sit on top of the CLI

This is not a transitional plan for user-visible intermediate phases.
It is the implementation spec for the final product we want to ship.

## Final Product From The User's Point Of View

### What a human experiences

1. They install `vana` with one obvious command.
2. They do not need to know or care that the implementation uses Node/TypeScript.
3. They run:

```bash
vana connect github
```

4. If a browser runtime is needed, `vana` handles it directly.
5. If login or 2FA is needed, `vana` asks clearly.
6. The user gets a concrete outcome:
   - data connected locally
   - data ingested to the Personal Server
   - manual input needed
   - source unavailable
7. The user never has to install `node`, `npm`, or Playwright themselves.

### What a coding agent experiences

1. It can rely on an installed `vana` binary.
2. It can run:

```bash
vana sources --json
vana status --json
vana connect <source> --json --no-input
```

3. It gets stable structured events and outcomes.
4. It can fall back to interactive reruns when the runtime emits `needs_input`.
5. It can access explicit debugging capabilities when needed, without depending on raw Playwright internals.

### What is explicitly not true in the final product

- the user is not required to have system `node`
- the user is not required to have system `npm`
- `vana setup` does not run `npm install`
- `vana connect` does not shell out to `node run-connector.cjs`
- the CLI does not depend on copied runtime scripts under `~/.vana/playwright-runner/`

## Product Decisions Locked By This Spec

These are now the working decisions unless a later discovery proves they are wrong.

1. The final product is one `vana` CLI plus an SDK/runtime core, not separate human and agent CLIs.
2. The runtime rewrite should target the clean end state directly, not an incremental user-visible bridge.
3. The first runtime host should be **in-process**, not worker-first.
4. The runtime core must be **transport-agnostic** so a worker host or app host can be added later without redesigning the core.
5. The runtime must expose **capabilities**, not raw Playwright objects.
6. Existing connectors must continue to work during and after the rewrite.
7. Headed fallback must remain supported.
8. The default profile strategy remains **Vana-managed isolated profiles**.
9. Chromium may still be a one-time managed download during setup.
10. Installer/release work must only claim a standalone experience once runtime execution and setup no longer depend on external `node` or `npm`.

## Non-Goals For This Rewrite

These are intentionally out of scope for the final product defined here:

- existing browser profile support
- remote/cloud connector execution
- embrowse or webview execution backends
- a TUI-first CLI
- a plugin system
- a public browser automation SDK
- redesigning connector authoring as a new format

These futures must remain possible, but they are not required to complete this spec.

## Critical Current Problems This Spec Must Eliminate

The current system still has transitional behavior that is not acceptable in the final product:

1. `ensureInstalled()` runs `npm install --ignore-scripts`.
2. connector execution still depends on `run-connector.cjs`.
3. the SEA binary still needs `node` on `PATH` for connector execution in some paths.
4. the current runtime state model assumes a copied sidecar under `~/.vana/playwright-runner/`.
5. installer/release work currently looks stronger than the runtime truth unless we finish the runtime rewrite.

The final product is not done until all five are removed.

## Final Architecture

### High-level shape

The system should end up as:

- `connect-core`
  - shared types, events, state, paths, errors
- `connectors`
  - registry resolution and connector discovery
- `runtime-core`
  - connector run contracts
  - capability contracts
  - event contracts
  - state machine
- `runtime-playwright`
  - Playwright-based implementation of the runtime core
- `cli`
  - command grammar, prompts, output formatting, JSON mode
- `install/release`
  - artifact generation, checksums, installer scripts, release metadata

The CLI should call the runtime core directly.
The runtime core should not depend on CLI-specific assumptions.

### Runtime host model

The first final host should be **in-process**:

- no external `node` child process
- no deployed `run-connector.cjs`
- no deployed copied `playwright-runner` package

Important nuance:

- the runtime core must still be written so a worker-based host can be added later
- the host boundary is an internal implementation detail
- the API surface is capability-based, not host-based

### Why in-process first

- simplest final product
- easiest to test
- easiest to make honestly standalone
- avoids committing early to message-passing/orchestration complexity that may not be necessary
- still compatible with adding a worker host later if isolation becomes necessary

## Runtime Core Contract

### Principle

The runtime must expose **runs**, **events**, and **debug capabilities**.

The runtime must not expose raw Playwright `Browser`, `Context`, or `Page` objects outside the runtime implementation.

### Required runtime interfaces

Illustrative shape:

```ts
interface ConnectorRuntime {
  ensureReady(request: RuntimeSetupRequest): Promise<RuntimeSetupResult>;
  startRun(request: ConnectorRunRequest): Promise<ConnectorRunHandle>;
  listCapabilities(source: string): Promise<RuntimeCapabilities>;
}

interface ConnectorRunHandle {
  id: string;
  events(): AsyncIterable<RuntimeEvent>;
  provideInput(input: Record<string, string>): Promise<void>;
  stop(reason?: string): Promise<void>;
  getState(): Promise<RunStateSnapshot>;
  takeScreenshot(): Promise<RuntimeArtifact>;
  inspect(): Promise<RunInspection>;
}
```

This interface is illustrative, not exact naming.
The important constraint is the shape of the interaction:

- create run
- consume events
- provide input
- inspect or debug
- stop

### Required runtime events

The runtime core must produce events rich enough for:

- CLI human output
- CLI `--json` mode
- skill orchestration
- Desktop mediation later

Required events:

- `run-started`
- `state-changed`
- `needs-input`
- `headed-required`
- `legacy-auth`
- `artifact-created`
- `collection-complete`
- `ingest-started`
- `ingest-complete`
- `runtime-error`
- `run-stopped`

Not every event must surface directly to end users, but they must exist in the internal contract.

### Required runtime debug capabilities

These are required in the runtime API even if the first CLI only surfaces a subset:

- `takeScreenshot`
- `getCurrentUrl`
- `getRunState`
- `inspect`
  - current step
  - current page title if available
  - current URL if available
  - whether browser is headed/headless
  - whether login/session is already established
- `stopRun`

Future-facing but not required in v1 CLI output:

- limited DOM/visible text inspection
- network capture inspection
- explicit headed handoff

### Why these debug capabilities matter

They are needed for:

- agent-assisted connector development
- richer Desktop mediation
- debugging failed auth flows
- future recovery/inspection surfaces

They are **not** a reason to expose raw Playwright objects outside the runtime.

## Browser And Profile Strategy Contracts

The runtime core must separate:

- execution backend
- browser strategy
- profile strategy

### Browser strategy

Required shape:

```ts
interface BrowserStrategy {
  ensureBrowserReady(): Promise<BrowserReadyState>;
  launch(request: LaunchRequest): Promise<BrowserSession>;
}
```

Initial implementation:

- Playwright
- managed Chromium download
- headless by default
- headed fallback supported

### Profile strategy

Required shape:

```ts
interface ProfileStrategy {
  resolveProfile(run: ConnectorRunRequest): Promise<ProfileHandle>;
}
```

Initial implementation:

- isolated Vana-managed profile under `~/.vana/browser-profiles/`

The runtime must not hardcode assumptions that make these impossible later:

- existing browser profile
- ephemeral sandbox profile
- connector-specific profile behavior

## Connector Compatibility Requirements

### Core requirement

Existing connectors from `data-connectors` must continue to work without requiring mass rewrites.

### What must be preserved

- current connector registry resolution
- current connector file loading model
- current result shape
- `requestInput` / input-driven flow support
- legacy auth detection for connectors using older patterns
- headed fallback capability

### Compatibility adapter

The runtime rewrite must provide a compatibility layer that adapts current connector expectations into the new runtime core.

That adapter is responsible for:

- loading connector modules
- constructing the page/runtime API the connector expects
- translating connector input requests into runtime `needs-input` events
- translating legacy auth into `legacy-auth`
- translating completion/errors into runtime events

### What is explicitly not allowed

The compatibility adapter must not require:

- shelling out to `run-connector.cjs`
- spawning system `node`
- copying connector runner source into the user home

## Runtime Setup In The Final Product

### Final meaning of `vana setup`

`vana setup` should only do runtime work the user actually needs.

Allowed responsibilities:

- create required state directories
- ensure browser cache location exists
- ensure managed Chromium is installed
- verify runtime health
- optionally clean/repair caches

Disallowed responsibilities:

- `npm install`
- `pnpm install`
- copying `run-connector.cjs` into `~/.vana/`
- copying `playwright-runner` into `~/.vana/`

### Final runtime state check

The runtime should be considered installed/healthy based on:

- runtime core availability inside the binary/package
- browser availability / browser install state
- required state directories

It must no longer depend on:

- `~/.vana/playwright-runner/index.cjs`
- `~/.vana/run-connector.cjs`

### Files that should disappear from fresh installs

Fresh installs of the final product should not create:

- `~/.vana/playwright-runner/`
- `~/.vana/run-connector.cjs`

Required files/directories that may remain:

- `~/.vana/connectors/`
- `~/.vana/browser-profiles/`
- `~/.vana/browsers/`
- `~/.vana/logs/`
- `~/.vana/last-result.json`
- `~/.vana/vana-connect-state.json`

## Chromium Installation In The Final Product

### Decision

Chromium remains a one-time managed download during setup.

### Requirements

- the download must be initiated by `vana` itself
- the user must not need `npx playwright install`
- the user must not need external `node`
- the process must log clearly and recover cleanly

### Implementation constraint

Browser installation must be triggered through internal runtime code, not shelling out to:

- `npx playwright install`
- `npm exec playwright install`

If using Playwright internals is required, that is acceptable.
If a small vendored installer helper is required, that is acceptable.

What is not acceptable is preserving an external Node/npm requirement for browser installation.

## CLI Contract That Must Be Preserved

The runtime rewrite must not change the public command model:

```bash
vana connect <source>
vana sources
vana status
vana setup
```

### Human-mode contract

Must remain:

- calm
- concise
- explicit about setup/downloads
- explicit about local-only vs Personal Server ingest
- explicit about next steps

### Machine-mode contract

The following commands must remain first-class:

```bash
vana sources --json
vana status --json
vana connect <source> --json --no-input
```

### Required outcome preservation

The runtime rewrite must preserve these user-visible outcomes:

- `connected_and_ingested`
- `connected_local_only`
- `needs_input`
- `legacy_auth`
- `setup_required`
- `connector_unavailable`
- `runtime_error`
- `unexpected_internal_error`

The runtime implementation may change; the product contract should not.

## Installer And Release Final Product

### Final install channels

The final product should ship with all of these:

1. `install.sh`
2. `install.ps1`
3. GitHub Release assets
4. Homebrew formula/tap
5. Winget manifest

The package-manager channels should be generated from the same release artifact truth, not maintained by hand indefinitely.

### Artifact matrix

Required release assets:

- `vana-linux-x64.tar.gz`
- `vana-darwin-x64.tar.gz`
- `vana-darwin-arm64.tar.gz`
- `vana-win32-x64.zip`
- matching `.sha256` files for each

### Installer contract

Installers must:

- resolve the correct release asset
- download the asset
- download the checksum
- verify the checksum
- install `vana` into a normal user location
- print the next step

Installers must not:

- ask the user to install Node
- install npm packages globally
- expose `@opendatalabs/connect` as the primary user-facing concept

### Install locations

Default install targets:

- macOS/Linux binary:
  - `~/.local/bin/vana`
- macOS/Linux runtime root:
  - `~/.local/share/vana/`
- Windows binary:
  - user-level bin directory suitable for `PATH`
- Windows runtime root:
  - user-local app data under `Vana`

### Upgrade contract

Re-running the installer must:

- install a new version under a versioned release directory
- update the `current` pointer/symlink
- preserve local data under `~/.vana/`

### Uninstall contract

The repo must document how to uninstall:

- the `vana` binary
- installed release directories

It should not tell users to manually guess where files live.

## Release Pipeline Requirements

### Build truth

The release pipeline must produce the same artifact shape used by installers and package-manager channels.

### Build inputs

Build-time use of Node 25 SEA is acceptable.
Runtime dependence on user-installed Node is not.

### Required release jobs

1. build artifact matrix
2. smoke-test each artifact at least minimally
3. attach assets to GitHub releases
4. publish npm package only as a secondary distribution channel
5. generate/update package-manager metadata

### Canary requirements

Canary releases must still work, but canary should not be the main product install story once the final installer path is live.

### Stable release requirements

Stable release must not be cut until:

- no external `node` is required at runtime
- no external `npm` is required at setup time
- installed `vana` works on a clean machine

## Skill And Onboarding Requirements

The skill and agent guidance should end at:

1. prefer installed `vana`
2. fall back to release-channel package only when appropriate
3. use local dev path only for explicit debugging/development

The skill should not point users at raw scripts once the final runtime rewrite is complete.

The skill should continue to use:

- `vana sources --json`
- `vana status --json`
- `vana connect <source> --json --no-input`

## Required Test Matrix

### Runtime correctness tests

Required automated tests:

- registry discovery from repo and non-repo working directories
- source listing from installed binary
- missing connector outcome
- `needs_input` outcome
- `legacy_auth` outcome
- successful local collection
- successful Personal Server ingest when target exists
- headed fallback path where applicable

### Standalone truth tests

Required proof before calling the product standalone:

- installed `vana` runs with `node` absent from `PATH`
- installed `vana` runs with `npm` absent from `PATH`
- `vana status --json` works
- `vana sources --json` works
- `vana connect github --json --no-input` works and returns `needs_input`

This must be enforced in CI, not just proven once manually.

### Installer tests

Required automated tests:

- Unix installer smoke test
- checksum verification failure test
- upgrade test
- Windows installer smoke test

### Release artifact tests

Per-platform smoke tests must verify:

- artifact starts
- `--help` works
- `status --json` works

At least one platform in CI must also verify a full installer path.

## Required Deletions Before Marking Complete

The following transitional mechanisms must be removed or retired from the product path:

- `run-connector.cjs` as a user/runtime dependency
- copied `playwright-runner` installation in the user home
- runtime `npm install`
- runtime `npx playwright install`
- runtime execution through system `node`

These files may remain temporarily in the repo for reference during migration, but they must not be part of the final product path.

## Execution Order

This is the order implementation should follow.

### 1. Freeze the runtime contract

Create the runtime core interfaces and event/capability contracts first.

Required deliverables:

- runtime contract types
- run lifecycle state model
- capability model
- event model

### 2. Port orchestration logic into TypeScript runtime modules

Port the logic currently living in `run-connector.cjs` into runtime modules.

Required deliverables:

- direct orchestration module
- no stdio JSON parsing in the main product path
- direct in-memory input flow in the runtime core

### 3. Port the Playwright runner into runtime modules

Port the logic currently living in `playwright-runner/index.cjs`.

Required deliverables:

- Playwright host module
- browser launch module
- page API / connector compatibility adapter
- debug capability implementation

### 4. Replace CLI runtime calls

Replace `ManagedPlaywrightRuntime.runConnector()` so it uses runtime modules directly.

Required deliverables:

- no `spawn(node, run-connector.cjs ...)`
- preserved CLI events/outcomes

### 5. Replace setup path

Replace `ensureInstalled()` so it only manages:

- browser availability
- state directories
- runtime health

Required deliverables:

- no `npm install`
- no copied runner source

### 6. Prove standalone truth

Run installed-binary tests with `node` and `npm` absent from `PATH`.

This is the gate that decides whether the installer/release story is honest.

### 7. Finalize installer/release channels

Only after standalone truth is proven:

- installer scripts become the canonical story
- Homebrew and winget metadata become required
- skill/onboarding can fully prefer installed `vana`

### 8. Remove transitional runtime assets from the product path

After parity is proven, remove or retire:

- script wrappers
- copied runner assumptions
- obsolete runtime state checks

## What Must Not Happen During Execution

To protect the final product quality, do not:

- reintroduce external `node` as an implicit runtime dependency
- reintroduce external `npm` as a setup dependency
- hardcode Playwright internals into the public runtime contract
- expose raw browser/page objects outside the runtime implementation
- couple the runtime core to CLI prompt behavior
- hardcode isolated-profile assumptions into the runtime core
- change the public CLI grammar during the runtime rewrite

## Completion Criteria

The final product is done only when all of these are true:

1. A clean machine can install `vana` without preinstalled Node/npm.
2. `vana setup` completes without calling external package managers.
3. `vana status --json` works from the installed binary.
4. `vana sources --json` works from the installed binary.
5. `vana connect github --json --no-input` returns `needs_input` from the installed binary on a clean machine.
6. Existing connectors still work through the compatibility adapter.
7. Headed fallback still exists.
8. Installer scripts are real and verified.
9. GitHub release assets, Homebrew, and winget all point at the same artifact truth.
10. The skill can honestly prefer installed `vana` as the main path.

Until all ten are true, the final product defined by this spec is not complete.
