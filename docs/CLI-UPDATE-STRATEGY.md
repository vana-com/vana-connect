# Vana CLI Update Strategy

_March 19, 2026_

## Purpose

Define a unified update strategy across three surfaces:

1. The `vana` CLI binary itself
2. Connector scripts (the scrapers that collect data)
3. Collected data freshness

The strategy must match the UX bar set by Stripe, Vercel, GitHub CLI, and
Cargo/rustup. For Vana specifically, update UX is load-bearing: if a connector
is stale and the scrape fails silently, the user loses trust in the entire
product.

## Prior art summary

Based on research into nine production CLIs (Stripe, Vercel, gh, Homebrew,
Cargo/rustup, Claude Code, npm, pnpm):

| Pattern                         | Used by                       | Tradeoff                                         |
| ------------------------------- | ----------------------------- | ------------------------------------------------ |
| Notification-only (24h cache)   | gh, Vercel, npm, pnpm, Stripe | Non-intrusive but relies on user action          |
| Blocking pre-command update     | Homebrew                      | Always fresh but frustrates impatient users      |
| Background auto-update          | Claude Code (native)          | Invisible but has had reliability issues         |
| Self-update command             | rustup, pnpm                  | Explicit but requires user awareness             |
| Plugin/extension update command | gh, Stripe                    | Flexible but stale-by-default without discipline |

Key industry findings:

- The 24-hour cached background check is the consensus standard
- stderr is the correct channel for update notifications
- Install-method-aware notifications prevent false positives (Claude Code's
  Homebrew/WinGet bug is a cautionary tale)
- Version pinning makes sense for reproducible builds (Cargo.lock,
  rust-toolchain.toml) but not for always-latest scrapers

## Surface 1: CLI binary updates

### Decision: notification-only, 24h cache, install-method-aware

Follow the gh/Vercel consensus. No self-update in v1.

### Behavior

On any command invocation:

1. Check `~/.vana/update-check.json` for cached result
2. If cache is missing or older than 24 hours, spawn a non-blocking background
   check against the correct source for the install method:
   - Homebrew: Homebrew API
   - Installer/SEA: GitHub Releases (latest tag)
   - npm: npm registry
   - Development: skip
3. If a newer version is known, print one line to **stderr**:
   ```
   Update available: 0.9.0 -> 0.10.0. Run: brew upgrade vana
   ```
   The upgrade command comes from `getLifecycleCommands()` (already exists).
4. Do not print the notification if:
   - `--json` flag is present
   - stdout is not a TTY (piped to another command)
   - `VANA_NO_UPDATE_NOTIFIER=1` is set
   - `CI=true` or `AGENT` is set

### Cache file shape

```json
{
  "lastCheckedAt": "2026-03-19T14:00:00Z",
  "latestVersion": "0.10.0",
  "currentVersion": "0.9.0"
}
```

### What not to do

- Do not block command execution for the check
- Do not auto-update the binary (install-method mismatch risk)
- Do not show a box/border (one line to stderr is enough)
- Do not check against npm if installed via Homebrew

## Surface 2: Connector updates

### Decision: always-fresh on connect, version-aware cache

This is the most important surface. A stale connector means broken data
collection. The user chose to connect right now — they should get the best
available scraper.

### Why always-fresh is correct here

Connectors are not application dependencies. There is no lockfile, no
reproducible-build concern, no CI pipeline that depends on a pinned version.
The user's intent is "get my data." A stale connector that fails against a
changed website is a product failure, not a version management decision.

Connectors are small (<100KB). The registry is already fetched on every
`connect` for source resolution. The marginal cost of a version comparison
is zero.

### Behavior

#### `vana connect <source>`

1. Fetch registry (already happens for source resolution)
2. Compare registry version against cached connector version
3. If versions differ: re-fetch the connector script silently before running
4. If registry is unreachable: use cached version (offline-safe)
5. If no cached version and registry unreachable: fail with guidance

The connector cache becomes an **offline fallback**, not a version lock.

Human-mode output when a connector updates (only if it actually re-fetched):

```
Connecting GitHub...
  Updated connector (1.2.0 -> 1.3.0).
```

One line, inline with the flow. Not a separate phase or prompt.

#### `vana sources <source>`

Show installed vs available version when they differ:

```
GitHub                                v1.2.0 (v1.3.0 available)
  Exports your GitHub profile, repositories, and starred repos.
```

#### `vana status`

Show connectors that have updates available:

```
Sources:
  github     connected    3 days ago    connector update available
  spotify    connected    12 hours ago
```

#### `--json` mode

Include version metadata in structured output:

```json
{
  "source": "github",
  "connectorVersion": "1.2.0",
  "latestConnectorVersion": "1.3.0",
  "connectorUpdateAvailable": true
}
```

### Implementation

The version comparison logic belongs in `fetchConnectorToCache()` in
`src/connectors/registry.ts`. Currently the function downloads the connector
if it's not in the cache but doesn't check versions. The change:

1. Read cached connector metadata (version) from
   `~/.vana/connectors/<source>-playwright.json`
2. Compare against registry entry version
3. If different or missing: download (as today)
4. If same: skip download, return cached path

The CLI's connect flow already calls `runtime.fetchConnector(source)` which
calls through to this function. No new call sites needed.

### What not to do

- Do not add a separate `vana connector update` command (connect does it)
- Do not version-pin connectors (users want latest working scraper)
- Do not prompt before updating connectors (they're small, the user asked to
  connect, just do it)
- Do not block on version checks when offline (use cache)

## Surface 3: Collected data freshness

### Decision: show age and recommended frequency in status views

This is informational, not an update mechanism. It helps users and agents
answer: "should I reconnect this source?"

### Behavior

#### `vana status` (human mode)

```
Sources:
  github      connected    3 days ago    weekly recommended
  spotify     connected    12 hours ago  daily recommended
  chatgpt     connected    2 weeks ago   weekly recommended  (stale)
```

"Stale" appears when time since last collection exceeds the recommended
`exportFrequency` from the connector metadata.

#### `vana status --json`

```json
{
  "source": "github",
  "lastCollectedAt": "2026-03-16T14:30:00Z",
  "exportFrequency": "weekly",
  "suggestedNextCollectionAt": "2026-03-23T14:30:00Z",
  "isOverdue": false
}
```

### What not to do

- Do not auto-reconnect stale sources (the user or agent decides)
- Do not nag about stale data in non-status commands
- Do not show freshness during `vana connect` (that command is action-focused)

## Implementation order

### Phase 1: Connector version-aware caching (highest impact)

This directly prevents the "stale connector → broken scrape → user loses
trust" failure mode.

1. Add version field to connector cache metadata
2. Compare versions in `fetchConnectorToCache()` before skipping download
3. Show "Updated connector" line in connect flow when re-fetched
4. Show version mismatch in `vana sources` and `vana status`

### Phase 2: CLI binary update notification

Lower urgency — users on Homebrew get updates via `brew upgrade`. But
important for installer/SEA users who have no other signal.

1. Add background version check (non-blocking spawn)
2. Add cache file read/write
3. Add install-method detection (already partially exists)
4. Add stderr notification with `getLifecycleCommands()` integration
5. Add `VANA_NO_UPDATE_NOTIFIER` opt-out

### Phase 3: Data freshness display

Informational only. Depends on `exportFrequency` being populated in
connector metadata (already partially available from the registry).

1. Add freshness computation to status queries
2. Add "stale" badge when overdue
3. Add `suggestedNextCollectionAt` and `isOverdue` to JSON output

## Acceptance criteria

### Connector updates

- `vana connect github` uses the latest connector version without user action
- A connector version update is communicated in one line during the connect
  flow
- Offline usage falls back to cached connector without error
- `vana sources github` shows when an update is available

### CLI binary updates

- A user on Homebrew sees "Run: brew upgrade vana" (not "Run: npm i -g ...")
- The notification appears at most once per 24 hours
- The notification does not appear in `--json` mode, piped output, or CI
- The version check does not slow down command execution

### Data freshness

- `vana status` shows time since last collection per source
- Sources overdue for collection are visually distinct
- `--json` mode includes computed freshness fields

## Relationship to existing docs

This document supersedes the connector update recommendations in:

- `research/cli-design/version-tracking.md` (proposed `vana connector update`
  — replaced by auto-update on connect)
- `research/cli-design/freshness-ux.md` (freshness display recommendations
  are adopted here)

This document complements:

- `docs/CLI-OPEN-ISSUES.md` (connector metadata utilization — version
  comparison is a new use of existing metadata)
- `docs/CLI-AGENT-FRIENDLY.md` (agent detection for notification suppression)
- `docs/CLI-FINAL-PRODUCT-SPEC.md` (installer/upgrade contract)
