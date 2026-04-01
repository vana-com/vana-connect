# CLI Telemetry PR 2 Implementation Plan

_April 1, 2026_

## Goal

Implement the CLI-side telemetry client in `vana-connect-2` so the CLI can:

- generate a narrow, anonymous-by-install telemetry stream
- persist telemetry preference and install identity locally
- spool command batches safely on disk
- upload batches to `https://telemetry.opendatalabs.com/v1/cli/events`
- expose clear user controls for status, enable, disable, and debug inspection

This is the second PR in the telemetry rollout.

PR 1 is the backend/admin work in `context-gateway`:

- `vana-com/context-gateway` PR #15

This PR should not redesign the backend contract. It should implement the CLI
against that contract.

## Shipping Position

This PR assumes the product decision is:

- narrow remote telemetry is on by default
- opt-out is immediate and local
- no first-run prompt
- sensitive data remains local

That means this PR must also update the current CLI copy that says:

- "Fully local"
- "Nothing is uploaded"
- "Telemetry: None."

Without that doc change, the implementation would violate the current trust
contract.

## Locked Decisions

These choices are no longer open for PR 2:

- remote telemetry is default-on
- no first-run consent prompt ships in PR 2
- `eventVersion` is `1`
- IDs use `crypto.randomUUID()` with simple prefixes like `inst_`, `run_`,
  `evt_`, `batch_`
- debug payloads print to `stderr`, not `stdout`
- telemetry never changes the `--json` stdout contract
- `vana telemetry disable` takes effect immediately and does not upload its own
  invocation
- `vana telemetry status` stays local-only
- one CLI invocation may produce multiple spool files if backend batch/size
  limits would be exceeded
- long-running commands flush startup telemetry before blocking

If product direction changes on any of those, the plan should be edited before
implementation starts.

## Key Decisions

### 1. Keep telemetry state in the existing CLI state file

Persist only durable preference and install identity in
`~/.vana/vana-connect-state.json`.

Add to `CliConfig`:

- `telemetryEnabled?: boolean`
- `telemetryInstallId?: string`

Why:

- existing file already has locking and migration behavior
- avoids a second config file
- `install_id` is configuration, not queued event data

### 2. Use a spool directory, not one append-only queue file

Store queued telemetry batches as individual JSON files under:

- `~/.vana/telemetry/outbox/`

Recommended shape:

- one spool file per CLI invocation
- filename includes timestamp, pid, and random suffix

Why:

- avoids cross-process append contention
- detached runs and scheduled runs can write concurrently
- failed uploads are easy to retry without reparsing a monolithic file

### 3. Reuse the existing CLI event vocabulary

Do not invent a second telemetry grammar for connect/ingest/runtime events.

Use two layers:

- wrapper-generated command lifecycle events
- mapped versions of existing `CliEvent` / `CliOutcome` events

The `emit.event(...)` path in `src/cli/index.ts` is already the best existing
source of truth for rich connector lifecycle telemetry.

### 4. Flush best-effort, never block the CLI hard

Upload should be opportunistic and time-bounded.

Recommended behavior:

- flush old spool files once near command start
- enqueue current command batch locally
- flush once again at command end
- use a short timeout per network attempt

If upload fails:

- leave spool files in place
- never fail the user command because telemetry failed

### 5. Debug mode prints the exact payload and suppresses upload

Support:

- `VANA_TELEMETRY_DEBUG=1`

Behavior:

- build the same envelope that would be uploaded
- print it locally to `stderr`
- do not upload it
- do not leave it queued

Why `stderr`:

- `stdout` must remain machine-safe for existing `--json` consumers
- users can still inspect the exact payload interactively

This is the trust/debug equivalent of the Vercel pattern and should be treated
as a first-class part of the UX, not a dev-only afterthought.

### 6. Allow endpoint override for preview and local verification

Default:

- `https://telemetry.opendatalabs.com/v1/cli/events`

Override:

- `VANA_TELEMETRY_URL=...`

Use this for preview verification against the deployed backend before
production cutover.

## Concrete File Plan

Primary write set:

- `src/core/paths.ts`
- `src/core/state-store.ts`
- `src/core/index.ts`
- `src/core/cli-types.ts`
- `src/cli/index.ts`
- `src/cli/update-check.ts`
- `src/cli/telemetry.ts` new
- `test/core/state-store.test.ts`
- `test/cli/index.test.ts`
- `test/cli/update-check.test.ts`
- `test/cli/telemetry.test.ts` new
- `cli/README.md`
- `docs/CLI-TELEMETRY.md` new

Optional if the implementation wants stricter typing separation:

- `src/cli/telemetry-types.ts` new

I would keep the first implementation in a single new module,
`src/cli/telemetry.ts`, unless that file becomes unmanageably large.

## Telemetry Module Design

Create a new CLI-only module:

- `src/cli/telemetry.ts`

Responsibilities:

- resolve effective telemetry state
- ensure/install `install_id`
- create a per-command telemetry session
- map CLI events to remote event envelopes
- persist one spool batch file per invocation
- flush spool files to the remote endpoint
- implement debug printing

Recommended public surface:

```ts
interface TelemetryCommandContext {
  command: string;
  subcommand?: string;
  source?: string;
  options: {
    json: boolean;
    noInput: boolean;
    quiet: boolean;
    detach: boolean;
    ipc: boolean;
  };
}

interface CliTelemetrySession {
  trackCliEvent(event: CliEvent | CliOutcome): void;
  markCommandResult(result: {
    exitCode: number;
    outcome?: string | null;
    errorClass?: string | null;
  }): void;
  persist(): Promise<void>;
  flush(): Promise<void>;
}

async function createCliTelemetrySession(
  context: TelemetryCommandContext,
): Promise<CliTelemetrySession>;
```

The implementation should use built-in Node primitives only:

- `crypto.randomUUID()`
- `fetch`
- `AbortSignal.timeout(...)`

Do not add a new runtime dependency just for telemetry.

Recommended helpers inside the module:

- `resolveTelemetryState()`
- `ensureTelemetryInstallId()`
- `buildTelemetryEvent(...)`
- `classifyOutcome(...)`
- `writeTelemetrySpoolFile(...)`
- `flushTelemetryOutbox(...)`

## Path Additions

Add to `src/core/paths.ts`:

- `getTelemetryDir()`
- `getTelemetryOutboxDir()`
- `getTelemetryDebugDir()` optional

I would not add a separate "sent" directory in v1. The outbox is enough.

## State Store Changes

Extend `CliConfig` in `src/core/state-store.ts`:

```ts
export interface CliConfig {
  personalServerUrl?: string;
  skillsPromptCompleted?: boolean;
  telemetryEnabled?: boolean;
  telemetryInstallId?: string;
}
```

Do not store queue contents in the state file.

Also export whatever minimal helpers are needed from `src/core/index.ts`.

## Event Envelope

The CLI should emit the same remote shape expected by PR 1:

```json
{
  "batchId": "batch_...",
  "sentAt": "2026-04-01T20:00:00.000Z",
  "client": {
    "name": "vana-cli",
    "version": "0.11.6"
  },
  "events": [
    {
      "eventId": "evt_...",
      "eventVersion": 1,
      "timestamp": "2026-04-01T20:00:00.000Z",
      "installId": "inst_...",
      "runId": "run_...",
      "eventName": "command_started",
      "command": "connect",
      "subcommand": null,
      "source": "github",
      "connectorVersion": "1.3.2",
      "authMode": "interactive",
      "platform": "darwin-arm64",
      "os": "darwin",
      "arch": "arm64",
      "cliVersion": "0.11.6",
      "channel": "stable",
      "installMethod": "homebrew",
      "ci": false,
      "agent": false,
      "interactive": true,
      "outcome": null,
      "errorClass": null,
      "durationMs": null,
      "storedScopeCount": null,
      "failedScopeCount": null,
      "metadata": {
        "launchMode": "direct"
      }
    }
  ]
}
```

ID format should be explicit:

- `installId = "inst_" + randomUUID()`
- `runId = "run_" + randomUUID()`
- `eventId = "evt_" + randomUUID()`
- `batchId = "batch_" + randomUUID()`

Use UTC ISO timestamps everywhere.

## Backend Limit Compliance

The backend currently enforces:

- max `100` events per request
- max `64 KB` request body

PR 2 should enforce those limits client-side before writing spool files.

Required behavior:

- split a command session into multiple envelopes when event count exceeds 100
- split again if serialized JSON would exceed 64 KB
- each envelope gets its own `batchId`
- dedupe safety still comes from per-event `eventId`

This is not optional. Relying on the server to reject oversized command batches
would make telemetry flaky for the noisiest connector runs.

## Redaction Boundary

Never send:

- raw CLI args
- prompt text
- prompt responses
- credential fields or values
- file paths
- log paths
- connector paths
- result payloads
- Personal Server URLs
- wallet addresses
- error messages verbatim

Allowed remotely:

- command / subcommand
- source
- connector version
- auth mode
- outcome
- coarse error class
- duration
- counts
- platform / OS / arch
- CLI version / channel / install method
- CI / agent / interactive flags
- bounded metadata like `launchMode`, `fieldCount`, `retryable`

## Effective Enablement Rules

Priority order:

1. `VANA_TELEMETRY_DEBUG=1`
   Result: enabled for local inspection only, no upload
2. `VANA_TELEMETRY_DISABLED=1`
   Result: disabled
3. `CliConfig.telemetryEnabled === false`
   Result: disabled
4. otherwise enabled

`vana telemetry enable` should persist `telemetryEnabled: true`.

`vana telemetry disable` should persist `telemetryEnabled: false`.

If the env var disables telemetry, `vana telemetry enable` should not override
the env var; `vana telemetry status` should show that the env var is currently
winning.

Additional command-specific rule:

- `vana telemetry status` is never remotely uploaded
- `vana telemetry disable` persists the preference first, then exits without
  uploading its own invocation
- `vana telemetry enable` persists the preference and only affects later
  commands in the same process if telemetry is re-resolved after the write

## Command UX

Add a new top-level command group in `src/cli/index.ts`:

- `vana telemetry status`
- `vana telemetry enable`
- `vana telemetry disable`

Recommended behavior:

### `vana telemetry status`

Human output should show:

- effective state: enabled / disabled / debug
- reason: default / config / env override
- install ID
- endpoint host
- queued batch count

JSON output should return:

```json
{
  "enabled": true,
  "mode": "normal",
  "reason": "default",
  "installId": "inst_...",
  "endpoint": "https://telemetry.opendatalabs.com/v1/cli/events",
  "queuedBatches": 2
}
```

### `vana telemetry enable`

- persist local preference
- print the new state
- return `0`

### `vana telemetry disable`

- persist local preference
- print the new state
- return `0`

No first-run prompt. No interactive consent wizard in v1.

Recommended human transcript for `vana telemetry status`:

```text
Telemetry

State        enabled
Reason       default
Install ID   inst_...
Endpoint     telemetry.opendatalabs.com
Queued       2 batch(es)

Disable with: vana telemetry disable
Inspect with: VANA_TELEMETRY_DEBUG=1 vana <command>
```

## Command Instrumentation Strategy

Do not manually sprinkle telemetry writes throughout every branch if a central
wrapper can do it.

Recommended structure:

1. Add a small command wrapper in `src/cli/index.ts` that creates a telemetry
   session for the current action.
2. Emit `command_started` before the action body runs.
3. Emit `command_completed` or `command_failed` after it returns.
4. Persist and flush in a `finally` block.
5. Pass the session into the emitter so `emit.event(...)` also feeds telemetry.

That wrapper should be used for:

- `version`
- `connect`
- `collect`
- `sources`
- `status`
- `doctor`
- `setup`
- `data list`
- `data show`
- `data path`
- `logs`
- `server status`
- `server set-url`
- `server clear-url`
- `server sync`
- `server data`
- `login`
- `logout`
- `mcp`
- `skills list`
- `skills install`
- `skills show`
- `skills` guided picker
- `schedule add`
- `schedule list`
- `schedule remove`
- `telemetry status`
- `telemetry enable`
- `telemetry disable`

For read-only commands, lifecycle events alone are enough.

For mutating/lifecycle-heavy commands, add richer mapped events below.

## Event Mapping By Surface

### All commands

Emit:

- `command_started`
- `command_completed`
- `command_failed`

Populate:

- `command`
- `subcommand`
- `source` when relevant
- `durationMs`
- `outcome`
- `errorClass`

Use `command_completed` only for exit code `0`.

Use `command_failed` for any non-zero exit code, even when the user-facing CLI
already emitted a richer connector outcome.

### `runConnect(...)` and `runCollect(...)`

Use the existing `emit.event(...)` path as the main telemetry source.

Map:

- `setup-check` -> `runtime_check_completed`
- runtime install branch start -> `runtime_install_started`
- `setup-complete` -> `runtime_install_completed`
- runtime install exception -> `runtime_install_failed`
- connector update detected -> `connector_update_applied`
- `connector-resolved` -> `connector_resolved`
- `needs-input` -> `input_required`
- `legacy-auth` -> `legacy_auth_required`
- `collection-complete` -> `collection_completed`
- `runtime-error` -> `collection_failed`
- `ingest-started` -> `ingest_started`
- `ingest-complete` -> `ingest_completed`
- `ingest-partial` -> `ingest_partial`
- `ingest-failed` -> `ingest_failed`
- `ingest-skipped` -> `ingest_skipped`
- `outcome` -> folded into final command result and connector outcome

Important implementation detail:

- do not send event `message`, `resultPath`, `connectorPath`, or `logPath`
- do send counts from `scopeResults`

Recommended metadata additions:

- `launchMode: direct | detached`
- `inputMode: interactive | no_input | ipc`
- `fieldCount` for `input_required`

### `runSetup(...)`

Emit:

- `runtime_check_completed`
- `runtime_install_started`
- `runtime_install_completed`
- `runtime_install_failed`

### `runLogin(...)`

Emit:

- `login_started`
- `login_authorized`
- `login_failed`

Recommended metadata:

- `target: account | self_hosted`
- `personalServerConfigured: boolean`

Never send:

- account address
- auth URL
- Personal Server URL

### `runLogout(...)`

Emit:

- `logout_completed`

### `runServerSync(...)`

Emit:

- `server_sync_started`
- `server_sync_completed`
- `server_sync_failed`

Include:

- `storedScopeCount`
- `failedScopeCount`

### `runServerSetUrl(...)` / `runServerClearUrl(...)`

Emit:

- `server_target_updated`
- `server_target_cleared`

Do not send the URL itself.

### `runSkillInstall(...)`

Emit:

- `skill_installed`

Metadata:

- `skillName`

### `runScheduleAdd(...)` / `runScheduleRemove(...)`

Emit:

- `schedule_added`
- `schedule_removed`

Metadata:

- `interval`

### `runDetached(...)`

Emit:

- `detached_run_spawned`

The spawned child process should still emit its own normal command lifecycle
events. The parent event is only for measuring detached launch reliability.

### `startMcpServer()`

Emit:

- `mcp_started`

### Background update checks

`src/cli/update-check.ts` currently returns `void`. Change it so the caller can
observe result classification without changing user-facing behavior.

Recommended result type:

```ts
interface UpdateCheckResult {
  attempted: boolean;
  installMethod: CliInstallMethod;
  latestVersion: string | null;
  currentVersion: string;
  outcome: "updated" | "no_update" | "fetch_failed" | "skipped";
}
```

Emit from `runCli(...)`:

- `update_check_completed`

Do not block exit on it. Treat it as best-effort like today.

Exact behavior:

- start the update check where it starts today
- if it resolves before the command telemetry session is persisted, include the
  event in that session
- if it does not resolve in time, drop the telemetry for that particular update
  check rather than writing a second out-of-band spool file after command exit

## Error Classification

Do not upload raw `reason` strings from `CliOutcome`.

Add a classifier in `src/cli/telemetry.ts` that maps outcomes and known reason
patterns to coarse classes such as:

- `setup_required`
- `setup_declined`
- `source_required`
- `prompt_cancelled`
- `auth_failed`
- `needs_input`
- `legacy_auth`
- `runtime_error`
- `connector_unavailable`
- `personal_server_unavailable`
- `ingest_failed`
- `unexpected_internal_error`

If an error does not match a known class:

- use `unknown`

Do not fall back to raw error text.

## Spool File Shape

Recommended file contents:

- exactly one request envelope per spool file

Recommended filename:

- `<timestamp>-<pid>-<runId>.json`

Recommended file contents:

- one JSON request envelope
- no trailing log text
- UTF-8 only

Recommended directory behavior:

- create `~/.vana/telemetry/outbox/` lazily
- ignore unknown files in that directory
- only delete files that this client successfully uploaded

Recommended flush behavior:

1. list outbox files oldest-first
2. upload up to a small bounded number per invocation
3. delete a spool file only after a `202` response
4. leave it in place on any non-`202` or network error

I would start with:

- up to `10` spool files per flush call
- `1500ms` timeout per request

Request details should be fixed:

- method: `POST`
- header: `Content-Type: application/json`
- header: `User-Agent: vana-cli/<cliVersion>`

The backend already dedupes on `eventId`, so retrying entire files is safe.

## Integration Point In `createEmitter(...)`

Change `createEmitter(...)` to accept an optional telemetry callback:

```ts
function createEmitter(
  options: GlobalOptions,
  onCliEvent?: (event: CliEvent | CliOutcome) => void,
): Emitter;
```

Then:

- continue writing JSON events to stdout in `--json` mode
- also forward every emitted event to telemetry when enabled

That keeps machine-readable stdout behavior unchanged.

The telemetry callback must be synchronous from the emitter’s perspective.

That means:

- emitter forwards the event immediately
- telemetry session only buffers in memory at that point
- persistence and network work happen later in the command wrapper

## Docs And Trust Copy

This PR must update `cli/README.md`.

Recommended copy changes:

- change "Fully local" to something like
  "Credentials and collected data stay on your machine"
- replace "Nothing is uploaded" with language that distinguishes collected data
  from anonymous operational telemetry
- replace "Telemetry: None." with explicit controls and exclusions

Recommended privacy paragraph:

> The CLI sends small anonymous operational telemetry by default to improve
> connector reliability: command family, source, success/failure, duration,
> CLI version, platform, and coarse error class. It does not send credentials,
> tokens, raw args, file paths, prompts, collected data, or Personal Server
> URLs. Disable with `vana telemetry disable` or
> `VANA_TELEMETRY_DISABLED=1`. Inspect the exact payload with
> `VANA_TELEMETRY_DEBUG=1`.

Also add:

- `docs/CLI-TELEMETRY.md`

That doc should include:

- what is collected
- what is explicitly not collected
- commands and env vars
- a sample payload

It should also explicitly say:

- telemetry events are operational, not collected-data uploads
- disabling telemetry does not affect connector functionality

## Test Plan

### Automated

#### `test/core/state-store.test.ts`

Add coverage for:

- telemetry preference merges correctly with other config
- install ID is preserved across updates

#### `test/cli/telemetry.test.ts`

Add a focused new test file for:

- install ID is created once and reused
- env disable overrides local enable
- debug mode prints but does not queue
- spool file is written with redacted payload
- successful upload deletes spool file
- failed upload preserves spool file
- endpoint override works
- upload payload matches the backend contract

Use `vi.stubGlobal("fetch", ...)` and temp directories like the existing tests.

#### `test/cli/index.test.ts`

Add command-level coverage for:

- `vana telemetry status --json`
- `vana telemetry enable`
- `vana telemetry disable`
- `vana connect github --json` still prints the existing stdout event stream
  while also writing/uploading telemetry

Also add at least one assertion that a non-telemetry command, like `vana
status`, still records command lifecycle telemetry without changing user-facing
output.

Add one regression test for:

- `VANA_TELEMETRY_DEBUG=1` plus `--json` still leaves stdout parseable as JSON

#### `test/cli/update-check.test.ts`

If `checkForUpdate()` starts returning structured results, add/update tests for:

- skipped branch
- success branch
- failed fetch branch

### Manual

Local verification with preview backend:

```bash
VANA_TELEMETRY_URL=https://<preview-or-prod>/v1/cli/events vana telemetry status --json
VANA_TELEMETRY_DEBUG=1 vana connect github
vana telemetry disable
vana telemetry enable
```

Then verify:

- debug output prints a compliant payload
- disable prevents queue writes
- enable restores queue writes
- a real command uploads successfully against the deployed backend
- the admin page in PR 1 shows the connector row after test traffic lands

## Suggested Implementation Sequence

1. Add telemetry paths.
2. Extend state config for `telemetryEnabled` and `telemetryInstallId`.
3. Create `src/cli/telemetry.ts`.
4. Add spool persistence and flush logic.
5. Add top-level command lifecycle wrapper.
6. Thread telemetry callback through `createEmitter(...)`.
7. Instrument `runConnect`, `runCollect`, `runSetup`, and `runLogin`.
8. Instrument `runServerSync`, `runSkillInstall`, `runScheduleAdd`,
   `runDetached`, `mcp`, and update checks.
9. Add `vana telemetry status|enable|disable`.
10. Add docs and README changes.
11. Add focused tests.
12. Run `pnpm test`, `pnpm lint`, and targeted format checks.

## Long-Running Commands

`vana mcp` is different from short-lived commands.

Required behavior:

- create a telemetry session
- emit `command_started`
- emit `mcp_started`
- persist and flush immediately before the server blocks indefinitely

Optional for v1:

- `command_completed` on graceful shutdown

Do not block PR 2 on perfect shutdown telemetry for long-running commands.

## Non-Goals For PR 2

Do not include:

- installer script telemetry in `install/install.sh` or `install/install.ps1`
- a first-run consent prompt
- a local analytics UI inside the CLI
- exporting logs or screenshots
- identity-linked telemetry
- arbitrary free-form metadata uploads

Installer telemetry can be a later PR if needed. This PR is the CLI runtime
itself.

## Acceptance Criteria

PR 2 is done when:

- the CLI generates one anonymous `install_id` and persists it locally
- telemetry can be enabled, disabled, and inspected with clear UX
- command lifecycle telemetry is emitted for all top-level commands
- connect/setup/login/server/skill/schedule flows emit the agreed richer
  operational events
- spool files survive offline/failing uploads
- successful uploads delete spooled batches
- no raw args, paths, payloads, prompts, tokens, or URLs are sent
- README/privacy copy no longer claims "Telemetry: None."
- tests cover config, spooling, upload behavior, and command UX

## Bottom Line

PR 2 should not be "sprinkle a few fetch calls into `runConnect`."

It should be:

1. one small telemetry client module
2. one command wrapper for lifecycle events
3. one spool/outbox design that is safe under concurrent CLI runs
4. one explicit user-control surface
5. one doc update that honestly matches the product

That yields a CLI telemetry system you can depend on operationally without
turning the codebase into a pile of ad hoc analytics hooks.
