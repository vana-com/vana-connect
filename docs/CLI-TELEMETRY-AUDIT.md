# Vana CLI Telemetry Audit

_April 1, 2026_

## Purpose

This document audits the telemetry the `vana` CLI could plausibly collect,
what signals already exist in the codebase, and which telemetry would be
useful, risky, or incompatible with the current product promise.

It is intentionally broader than "what events should we emit to Segment."
For this CLI, telemetry includes:

- local run history and support artifacts
- structured machine events already emitted in `--json` mode
- product analytics that might be sent remotely
- operational health and reliability metrics
- installer/update/release instrumentation

## Scope

Audited surfaces:

- CLI commands in `src/cli/index.ts`
- JSON event and outcome contracts in `src/core/cli-types.ts`
- runtime events in `src/runtime/core/contracts.ts`
- local state in `src/core/state-store.ts` and `src/core/paths.ts`
- auth flows in `src/cli/auth.ts`
- update checks in `src/cli/update-check.ts`
- connector registry/download flows in `src/connectors/registry.ts`
- Personal Server detection and ingest in `src/personal-server/index.ts`
- MCP server wrapper in `src/cli/mcp-server.ts`
- installer scripts in `install/install.sh` and `install/install.ps1`
- CLI product docs and trust-copy in `cli/README.md` and `docs/CLI-*`

## Executive Summary

The CLI has a lot of telemetry potential already. It knows:

- which command ran
- whether the runtime was installed or missing
- which source was requested
- whether a connector was fetched or updated
- whether auth input was needed
- whether collection succeeded
- whether Personal Server ingest succeeded, failed, or was skipped
- which scopes stored or failed
- whether the run was detached or scheduled
- whether a skill was installed
- which install/update path the user is on

The hard part is not data availability. The hard part is product trust.

Today the CLI markets itself as:

- fully local
- credentials stay on-device
- collected data is local files
- "Telemetry: None."

That means remote telemetry cannot be treated as a quiet implementation detail.
If Vana wants remote analytics, it needs an explicit product decision, new
consent/copy, and a redaction model that is much stricter than a typical SaaS
CLI.

My recommendation:

1. Add rich local-only telemetry first.
2. Reuse the existing JSON event model as the source of truth.
3. Treat remote telemetry as explicit opt-in, not default-on.
4. Never collect raw result data, credentials, tokens, cookies, or free-form
   logs/screenshots remotely.

## Product Constraints

These are not nice-to-haves. They are the gating constraints for any telemetry
work.

### 1. The README promise is strong

`cli/README.md` says:

- "Fully local"
- "credentials and collected data never leave your machine"
- "Nothing is uploaded"
- "Telemetry: None."

Those statements create a much stricter bar than most CLIs.

### 2. The CLI already performs necessary network requests

The product is not literally air-gapped. It already talks to:

- Vana account auth endpoints
- self-hosted Personal Servers
- connector registry and connector asset URLs
- update endpoints
- GitHub release assets during install

Users can accept those requests because they are obviously part of the product
flow. Remote analytics would be a different category.

### 3. The CLI stores sensitive local state

Under `~/.vana/`, the CLI persists:

- `auth.json`
- `vana-connect-state.json`
- `update-check.json`
- connector cache
- browser profiles
- result JSON
- logs
- detached session metadata

That makes local observability powerful, but it also means remote export must
be heavily filtered.

### 4. Agent and machine mode stability matters

`--json` mode already emits structured events and outcomes. Any telemetry
implementation should avoid inventing a second event grammar if the first can
be extended.

## What Exists Today

## Existing Structured Signals

The CLI already emits structured event types in `--json` mode:

- `setup-check`
- `setup-complete`
- `connector-resolved`
- `run-started`
- `progress-update`
- `status-update`
- `needs-input`
- `headed-required`
- `legacy-auth`
- `collection-complete`
- `ingest-started`
- `ingest-complete`
- `ingest-partial`
- `ingest-failed`
- `ingest-skipped`
- `runtime-error`
- `outcome`

It also persists outcome-oriented state per source:

- connector installed/version
- export frequency
- session present
- last run timestamp
- last run outcome
- last collected timestamp
- data state
- last error
- last result path
- last log path
- connection health
- per-scope ingest results

This is already a telemetry substrate. It is just local and fragmented.

## Current Networked Touchpoints

The CLI and installer currently hit these endpoint classes:

| Surface                    | Purpose                                   | Codepath                                    |
| -------------------------- | ----------------------------------------- | ------------------------------------------- |
| Account auth               | Device-code login                         | `src/cli/auth.ts`                           |
| Self-hosted auth           | Device-code login against Personal Server | `src/cli/auth.ts`                           |
| Personal Server health     | Detect availability                       | `src/personal-server/index.ts`              |
| Personal Server ingest     | POST collected scope data                 | `src/personal-server/client.ts`             |
| Personal Server scope list | Inspect stored scopes                     | `src/personal-server/client.ts`             |
| Connector registry         | List and resolve sources                  | `src/connectors/registry.ts`                |
| Connector asset download   | Fetch scripts and metadata                | `src/connectors/registry.ts`                |
| Connector icons            | Cache icons                               | `src/connectors/registry.ts`                |
| Update checks              | CLI freshness                             | `src/cli/update-check.ts`                   |
| Installer release lookup   | Resolve latest version                    | `install/install.sh`, `install/install.ps1` |
| Installer asset download   | Download release archives/checksums       | `install/install.sh`, `install/install.ps1` |

## Audit Framework

I split telemetry into four buckets:

### A. Local Product Observability

Safe by default. Stored only on-device. Helps support, debugging, UX
iteration, and agent workflows.

### B. Remote Product Analytics

Potentially valuable, but incompatible with current copy unless explicitly
opted into.

### C. Operational Reliability Telemetry

Metrics about install/update/runtime/connect reliability. Often worth sending
remotely, but only if redacted and consented.

### D. Support Artifact Export

Explicit user-triggered bundle export for debugging. This should never be an
ambient background upload.

## Telemetry Opportunities By Surface

## 1. Installation And Upgrade

Surfaces:

- hosted install scripts
- Homebrew installs indirectly
- `vana setup`
- background update checks
- connector auto-updates during `connect`

### Valuable telemetry

Local:

- install script started/completed/failed
- install source: installer, Homebrew, development
- platform and architecture
- version requested vs installed
- checksum verification outcome
- post-install self-check outcome
- runtime install started/completed/failed
- Chromium install duration
- update check attempted/succeeded/failed
- connector update detected/applied/skipped

Remote, opt-in:

- installer funnel by platform/arch
- install failure rate by step
- median runtime setup duration
- update-check success rate
- connector checksum mismatch rate

### Why this matters

This is the cleanest telemetry category. It contains almost no user content and
would directly improve release reliability and packaging quality.

### Risk level

Low if redacted. Moderate only if Vana links it to user identity by default.

## 2. Command Adoption And User Journey

Surfaces:

- `version`
- `sources`
- `connect`
- `collect`
- `status`
- `doctor`
- `data list/show/path`
- `logs`
- `server *`
- `login` / `logout`
- `skills *`
- `mcp`
- `schedule *`

### Valuable telemetry

Local:

- command invoked
- subcommand invoked
- flags used: `--json`, `--no-input`, `--yes`, `--quiet`, `--detach`, `--ipc`
- interactive vs non-interactive run
- tty present or absent
- install method
- CLI version and channel
- exit code
- final outcome status
- next-step command shown to the user

Remote, opt-in:

- command adoption mix
- human vs agent usage split
- JSON mode penetration
- detached/scheduled usage
- MCP adoption
- skill adoption

### Why this matters

This would answer basic product questions:

- Is `connect` the real entry point?
- Do users actually use `status`, `logs`, and `doctor` after failures?
- Are agents using `--json --no-input` as designed?
- Is `mcp` real usage or roadmap theater?

### Risk level

Medium. Command names are not very sensitive, but sources can reveal user
interests or employment context if handled carelessly.

## 3. Source Discovery And Demand

Surfaces:

- `vana sources`
- `vana sources <source>`
- `vana connect <source>`
- connector unavailable path

### Valuable telemetry

Local:

- source searched/viewed/requested
- source matched exactly vs fuzzy match
- source unavailable
- auth mode of source: automated, interactive, legacy
- connector version available vs cached

Remote, opt-in:

- most requested sources
- highest-failure sources
- unsupported-source demand
- manual-browser source share vs automated share

### Why this matters

This is probably the single best input for connector roadmap prioritization.

### Risk level

Medium to high. Source choice is not content, but it can still be sensitive:
health, finance, shopping, work, social, and messaging connectors all carry
meaning.

Recommendation: if sent remotely, source IDs should be either consented
explicitly or grouped/coarsened by category.

## 4. Connect Funnel And Reliability

Surface:

- `runConnect()` in `src/cli/index.ts`

### Valuable telemetry

Local:

- connect started
- source requested
- runtime state at start
- Personal Server detected or not
- setup prompt shown
- setup accepted/declined
- connector fetch attempted
- fetch outcome and duration
- connector auto-update applied
- session reuse attempted
- auth mode encountered
- input requested and which fields were requested
- prompt cancelled
- headed-required emitted
- legacy-auth emitted
- collection completed
- result file parse failure
- ingest attempted
- ingest result by source and by scope
- final outcome status
- total connect duration
- durations by phase

Remote, opt-in:

- connect funnel drop-off by phase
- setup decline rate
- needs-input rate in machine mode
- runtime-error rate by source/auth mode/platform
- session reuse success rate
- Personal Server availability rate
- local-only vs ingested completion rate

### Why this matters

This is the highest-value telemetry in the product. It would explain:

- where connects fail
- whether the first-run experience is actually world-class
- which sources are hurting trust
- whether Personal Server integration is helping or hurting perceived success

### Risk level

High if implemented carelessly. This path touches:

- credential prompts
- browser-based auth
- local result paths
- Personal Server URLs
- per-scope data naming

This area needs strict field-level filtering.

## 5. Authentication

Surfaces:

- cloud device-code flow
- self-hosted Personal Server login
- env-var auth shortcut
- logout and token revocation

### Valuable telemetry

Local:

- login started
- auth target: cloud vs self-hosted
- auth source: env vs file vs interactive
- device code issued
- browser open attempted
- poll iterations
- login authorized
- login expired
- login error class
- personal server token present or absent
- logout attempted/completed
- remote revoke attempted/completed/failed

Remote, opt-in:

- login completion rate
- device code expiration rate
- browser-open failure rate by platform
- self-hosted auth success rate

### Why this matters

Auth is a likely source of friction, especially in agent and self-hosted flows.

### Risk level

Very high. Never collect remotely:

- device codes
- session tokens
- auth URLs
- wallet addresses in plaintext
- Personal Server tokens

Even locally, these should not be copied into telemetry rows. Record event
outcomes, not secrets.

## 6. Personal Server Integration

Surfaces:

- target detection
- health checks
- ingest
- `server status`
- `server set-url`
- `server clear-url`
- `server sync`
- `server data`

### Valuable telemetry

Local:

- target detection source: config, auth, env, scan
- target availability
- health latency
- server version
- ingest started/completed/failed/partial/skipped
- scope count stored vs failed
- manual sync invoked
- pending datasets synced
- server data listing source: remote vs local fallback
- saved URL set/cleared

Remote, opt-in:

- Personal Server availability rate
- ingest success rate
- partial-sync rate by source/scope family
- fallback-to-local rate
- manual `server sync` retry rate

### Why this matters

The CLI's most important trust boundary is the distinction between:

- data collected locally
- data actually ingested to the Personal Server

This is already modeled carefully in the product. Telemetry should preserve
that distinction exactly.

### Risk level

High. Personal Server URLs can reveal self-hosted infrastructure, tunnel URLs,
or user environments. Do not send full URLs remotely. At most, send:

- local vs remote
- auth configured vs not configured
- server version
- coarse host class

## 7. Data Inspection And Payoff

Surfaces:

- `data list`
- `data show`
- `data path`
- `logs`
- `doctor`
- `status`

### Valuable telemetry

Local:

- whether the user followed through to inspect collected data
- which post-success commands they used
- whether logs were opened after failures
- whether doctor/status were used as recovery commands
- dataset count
- data state distribution: local, synced, sync failed

Remote, opt-in:

- payoff completion rate: connect followed by `data show`
- support-intent signals: `logs` and `doctor` usage
- stale dataset rates

### Why this matters

A successful connect is not enough. Vana should know whether users reach the
"I can see and use my data" moment.

### Risk level

Medium. Avoid sending dataset paths, summary text, or any dataset-derived
content.

## 8. Scheduling, Detached Runs, And Background Collection

Surfaces:

- `--detach`
- `schedule add/list/remove`
- automatic daily schedule after first successful connect
- background `collect --all`

### Valuable telemetry

Local:

- detached run spawned
- detached child exit outcome
- schedule auto-created vs user-created
- schedule mechanism: launchd, cron, schtasks
- schedule list/remove usage
- number of due sources per batch
- number of pending syncs resolved automatically

Remote, opt-in:

- schedule adoption rate
- background collection success rate
- OS-specific scheduler issues

### Why this matters

Recurring collection is where retention actually lives. If this feature is
fragile or unused, Vana needs to know.

### Risk level

Low to medium if limited to mechanism and outcomes. Higher if Vana ships
actual cron/plist/task contents remotely.

## 9. Skills, Agent Usage, And MCP

Surfaces:

- `skills list/install/show`
- first-success skill prompt
- `mcp`
- `connect_source` MCP tool path
- agent flags and env usage

### Valuable telemetry

Local:

- skills prompt shown/accepted/declined
- skill installed
- skill already installed
- MCP server started
- MCP tool invoked
- child connect via MCP completed/failed
- agent-ish execution hints: `AGENT`, `--json`, `--no-input`, `--ipc`

Remote, opt-in:

- agent adoption rate
- MCP tool usage mix
- skill install conversion after first success
- gap between human and agent reliability

### Why this matters

The CLI explicitly positions itself as agent-ready. This area should be
measured if that claim matters strategically.

### Risk level

Low to medium. Agent usage patterns are not deeply sensitive, but the source
being connected still is.

## 10. Connector Ecosystem Quality

Surfaces:

- connector registry fetch
- checksum verification
- connector downloads
- auth-mode inference
- connector-specific failures

### Valuable telemetry

Local:

- registry load success/failure
- registry latency
- download success/failure
- checksum mismatch
- connector metadata missing or malformed
- source-specific runtime error class
- auth-mode inference result

Remote, opt-in:

- connector health score by source and version
- regression detection after registry updates
- checksum mismatch alerts
- stale connector cache patterns

### Why this matters

This is operationally important and mostly safe. It can help Vana catch broken
connectors before the product reputation suffers.

### Risk level

Low to medium.

## Sensitive Data Classification

## Never Collect Remotely

- raw collected result JSON
- any subset of exported personal data
- screenshots
- browser cookies
- browser profile contents
- session tokens
- Personal Server tokens
- device codes
- auth URLs containing one-time credentials
- full log files
- prompt responses like username, password, 2FA code
- exact local filesystem paths
- full wallet addresses unless the user explicitly asks to attach them in a
  support bundle

## Probably Do Not Collect Remotely By Default

- source IDs for sensitive categories
- full Personal Server URLs
- full error messages from third-party websites
- exact scope names if they reveal sensitive domains
- connector prompt field names if they reveal account-specific auth shapes

## Safe Or Mostly Safe After Redaction

- command name
- top-level outcome status
- duration buckets
- platform, architecture, CLI version, install method
- runtime state
- whether setup was required
- whether input was required
- whether Personal Server was available
- counts of scopes stored/failed
- coarse error class

## Recommended Telemetry Model

## Phase 1: Local-Only Telemetry Ledger

This should ship first.

Recommended shape:

- append-only JSONL under `~/.vana/telemetry/`
- one file per day or one file per run
- bounded retention, for example 14 to 30 days
- optional `vana telemetry export` later for explicit support bundles

Recommended fields:

- `event`
- `timestamp`
- `runId`
- `command`
- `subcommand`
- `source`
- `flags`
- `cliVersion`
- `channel`
- `installMethod`
- `platform`
- `arch`
- `tty`
- `durationMs`
- `outcome`
- `errorClass`
- `dataState`
- `ingestStoredCount`
- `ingestFailedCount`

Why first:

- zero trust-copy breakage
- immediately useful for support and product debugging
- leverages existing event model
- creates clean data for later opt-in upload if Vana decides to add it

## Phase 2: Explicit Opt-In Remote Telemetry

If Vana wants remote analytics, it should be one of these models:

- `vana telemetry enable`
- installer prompt with clear consent
- environment variable for team-managed installs
- config file boolean with explanatory copy

Default-off is the safest model given the current README promise.

Recommended remote payload rules:

- no raw logs
- no raw paths
- no raw Personal Server URLs
- no raw prompt messages from third-party sites
- no user content
- source IDs either consented directly or coarsened to category
- error messages normalized into codes/classes before upload

## Phase 3: Support Bundle Export

Separate from ambient analytics.

Recommended command eventually:

```bash
vana telemetry export
```

This could create a tarball or JSON bundle with:

- recent local telemetry rows
- doctor output
- status output
- redacted state summary
- selected log paths or excerpts

But only when the user explicitly chooses to export it.

## Recommended Event Taxonomy

This should be the canonical event set, shared between local telemetry and any
future remote pipeline.

## Session And Command Events

- `cli_invoked`
- `command_started`
- `command_completed`
- `command_failed`

Fields:

- command
- args class, not raw args
- flags
- interactiveMode
- tty
- runId

## Setup And Update Events

- `runtime_check_completed`
- `runtime_install_prompted`
- `runtime_install_declined`
- `runtime_install_started`
- `runtime_install_completed`
- `runtime_install_failed`
- `update_check_completed`
- `update_available_shown`
- `connector_update_applied`

## Source Discovery Events

- `sources_list_viewed`
- `source_detail_viewed`
- `source_requested`
- `source_unavailable`

## Connect Funnel Events

- `connect_started`
- `connector_resolve_started`
- `connector_resolve_completed`
- `session_reuse_attempted`
- `input_required`
- `prompt_cancelled`
- `headed_required`
- `legacy_auth_required`
- `collection_started`
- `collection_completed`
- `collection_failed`
- `ingest_started`
- `ingest_completed`
- `ingest_partial`
- `ingest_failed`
- `ingest_skipped`
- `connect_outcome_recorded`

## Auth Events

- `login_started`
- `device_code_issued`
- `browser_open_attempted`
- `login_authorized`
- `login_expired`
- `login_failed`
- `logout_completed`
- `token_revoke_attempted`
- `token_revoke_failed`

## Post-Success And Recovery Events

- `status_viewed`
- `doctor_viewed`
- `data_list_viewed`
- `data_show_viewed`
- `data_path_viewed`
- `logs_viewed`
- `server_status_viewed`
- `server_sync_started`
- `server_sync_completed`
- `server_data_viewed`

## Agent And Ecosystem Events

- `mcp_started`
- `mcp_tool_invoked`
- `skill_prompt_shown`
- `skill_installed`
- `schedule_added`
- `schedule_removed`
- `detached_run_spawned`

## Metrics Vana Would Probably Want

If Vana adds remote opt-in telemetry, these are the highest-value rollups:

### Adoption

- installs by platform and install method
- command usage share
- active sources connected per machine
- skills and MCP adoption
- schedule adoption

### Funnel

- install -> setup -> connect -> data-show conversion
- login completion rate
- connect success rate
- local-only vs ingested completion rate
- first-success-to-second-source conversion

### Reliability

- runtime install failure rate
- connector fetch failure rate
- checksum mismatch rate
- auth failure rate
- runtime-error rate by source/platform
- Personal Server availability rate
- partial ingest rate

### Performance

- setup duration
- connector fetch duration
- connect duration
- login duration
- ingest duration

### Retention Proxies

- scheduled collection enabled
- repeat collects
- manual server sync retries
- repeated `data show` usage after successful connect

## What I Would Not Do

- Do not silently add default-on remote telemetry while `cli/README.md`
  still says `Telemetry: None.`
- Do not upload logs "for debugging" without an explicit export action.
- Do not use raw source IDs, raw URLs, and raw error strings as the first
  version of remote analytics.
- Do not create a telemetry schema that diverges from the existing CLI event
  and outcome vocabulary unless there is a clear reason.
- Do not couple telemetry to auth identity by default.

## Recommended Implementation Order

1. Normalize existing CLI events into one internal telemetry schema.
2. Add a local telemetry writer with retention and tests.
3. Add phase durations to connect/setup/login flows.
4. Add coarse error classification so raw error strings do not become the only
   analytics path.
5. Decide product policy for remote telemetry and update docs/privacy copy.
6. Only then add explicit opt-in upload.

## Open Questions

1. Is Vana willing to change the public CLI promise from "Telemetry: None" to
   "Telemetry: Off by default" or similar?
2. Does Vana want source-level remote analytics badly enough to justify the
   privacy tradeoff?
3. Should source IDs be tracked remotely at all, or only as coarse categories?
4. Does support need a first-class `vana telemetry export` command?
5. Should agent/MCP usage be measured separately from human CLI usage?
6. Is installer telemetry worth instrumenting independently from CLI runtime
   telemetry?

## Bottom Line

The CLI already has enough internal structure to support excellent telemetry.
What it does not have is permission to send that telemetry remotely by
default.

The highest-leverage next move is:

- build local-only telemetry first
- make it power support, debugging, and UX iteration
- defer remote analytics until Vana makes an explicit privacy and product
  decision

That path improves observability immediately without breaking the trust model
the CLI is currently selling.
