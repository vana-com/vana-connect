# CLI ↔ Personal Server Integration Plan

_March 17, 2026_

## Context

The CLI claims "Synced to Personal Server" after `vana connect`, but no data
is actually sent. The `ingestResult()` function filters for dotted scope keys
(`key.includes(".")`), but connectors output flat keys (`profile`,
`repositories`). The loop runs zero iterations and reports success.

DataConnect Desktop already solves this pipeline in production. This plan
aligns the CLI with DataConnect's proven patterns and adds CLI-specific
capabilities (verification, retry, introspection, config persistence).

## Prior art: how DataConnect does it

DataConnect's `personalServerIngest.ts` handles two connector output formats:

1. **New format** — output keys are already dotted (`github.profile`) →
   extract and POST each scope separately
2. **Legacy format** — output keys are flat (`profile`) → use a platform
   registry to look up the default scope, POST entire blob

Auth: none (localhost trust). Verification: HTTP 2xx check only. Retry:
queues pending exports, delivers on PS startup.

The connector metadata (`github-playwright.json`) declares scopes like
`github.profile`, `github.repositories` — this is the canonical mapping.

## Phase 0: Fix ingest (stop lying)

**Goal:** Data actually reaches the personal server after `vana connect`.

### 0a. Scope resolver

Create `src/personal-server/scope-resolver.ts`:

```typescript
export interface ScopeMapping {
  scope: string; // "github.profile"
  data: unknown; // the value from the connector output
}

export function resolveScopes(
  source: string,
  result: Record<string, unknown>,
  metadata: ConnectorMetadata | null,
): ScopeMapping[];
```

Logic (matches DataConnect):

1. Extract keys containing `.` — if any found, use them directly as scopes
2. Otherwise, use connector metadata scopes to map: for each metadata scope
   `{source}.{key}`, look for `key` in the result object
3. If no metadata available, fall back to `{source}.{key}` for every
   non-metadata key (exclude `exportSummary`, `timestamp`, `version`,
   `platform`)

### 0b. Fix `ingestResult()`

Replace the current scope-guessing logic with `resolveScopes()`. POST each
resolved scope individually to `POST /v1/data/{scope}`.

Track per-scope success/failure:

```typescript
interface IngestScopeResult {
  scope: string;
  status: "stored" | "failed";
  error?: string;
}
```

Return `ingest-complete` only if ALL scopes succeed. Return `ingest-partial`
if some succeed. Return `ingest-failed` if all fail.

### 0c. Update state model

Add per-scope tracking to `StoredSourceState`:

```typescript
ingestScopes?: Array<{
  scope: string;
  status: "stored" | "failed";
  syncedAt?: string;
}>;
```

Replace the binary `ingested_personal_server` / `ingest_failed` with
granular per-scope state. The top-level `dataState` remains for backward
compat but is derived from the scope array.

### 0d. Verification

After posting all scopes, call `GET /v1/data?scopePrefix={source}` (requires
builder auth or devToken) to confirm scopes appear in the server's index.

If verification isn't possible (no auth configured), log a warning and trust
the HTTP 2xx responses (matching DataConnect's behavior).

**Files changed:**

- New: `src/personal-server/scope-resolver.ts`
- Modified: `src/personal-server/index.ts` (ingestResult)
- Modified: `src/core/state-store.ts` (scope tracking)
- Modified: `src/core/cli-types.ts` (new event types)
- Tests: `test/personal-server/scope-resolver.test.ts`

## Phase 1: Personal server client

**Goal:** A proper HTTP client for the personal server, replacing raw fetch
calls scattered through ingestResult.

### 1a. `createPersonalServerClient()`

Create `src/personal-server/client.ts`:

```typescript
export interface PersonalServerClient {
  health(): Promise<PersonalServerHealth>;
  ingestScope(scope: string, data: unknown): Promise<IngestScopeResult>;
  listScopes(prefix?: string): Promise<ScopeSummary[]>;
  listVersions(scope: string): Promise<VersionEntry[]>;
}

export function createPersonalServerClient(config: {
  url: string;
  auth?: { type: "devToken"; token: string } | { type: "none" };
}): PersonalServerClient;
```

Auth strategy:

- **Local (localhost):** no auth (matches DataConnect and PS design)
- **DevToken:** `Authorization: Bearer {token}` for dev UI and tunneled
  access
- **Web3Signed:** future, for cloud-hosted PS — not in this plan

### 1b. Update `ingestResult()` to use client

Replace raw fetch with `client.ingestScope()`. The client handles retries,
error normalization, and response parsing.

**Files changed:**

- New: `src/personal-server/client.ts`
- Modified: `src/personal-server/index.ts`
- Tests: `test/personal-server/client.test.ts`

## Phase 2: Config persistence + `vana server` commands

**Goal:** Users can configure, inspect, and manage their personal server
from the CLI.

### 2a. Persist PS URL

Add `personalServerUrl` to the CLI config (already exists in state-store
schema but only read from env var today). Add `vana server set-url <url>`
to persist it.

Detection priority (matches current code):

1. Persisted config (`~/.vana/vana-connect-state.json` → `config.personalServerUrl`)
2. `VANA_PERSONAL_SERVER_URL` env var
3. Localhost port scan (8080-8085)

### 2b. `vana server status`

Show:

```
Personal Server
  URL:      http://localhost:8080 (auto-detected)
  Status:   healthy
  Version:  0.0.1-canary.93673d7
  Owner:    not configured
  Scopes:   3 (github.profile, github.repositories, github.starred)
```

JSON mode returns the full health response + scope list.

### 2c. `vana server data [scope]`

Without argument — list all scopes with version counts:

```
github.profile        1 version   collected 2h ago
github.repositories   1 version   collected 2h ago
github.starred        1 version   collected 2h ago
```

With argument — show scope detail:

```
github.profile
  Versions:  1
  Latest:    2026-03-17T06:47:14Z
  Size:      1.2 KB
```

### 2d. `vana server sync`

Retry failed/pending ingests from local data. Reads state to find sources
with `dataState === "collected_local"` or partially-synced scope arrays.
Re-runs `ingestResult()` with the stored `lastResultPath`.

```
Syncing 1 pending dataset...
  github: 3/3 scopes synced ✓
```

**Files changed:**

- Modified: `src/cli/index.ts` (new commands)
- Modified: `src/core/state-store.ts` (config persistence)
- Modified: `src/personal-server/index.ts` (detection uses persisted config)

## Phase 3: Honest UX

**Goal:** The CLI never claims a state it can't prove.

### 3a. Status labels

| State                      | Badge                   | Meaning                         |
| -------------------------- | ----------------------- | ------------------------------- |
| All scopes synced          | `synced` (green)        | Every scope POSTed successfully |
| Some scopes synced         | `partial sync` (yellow) | Some scopes failed              |
| Sync attempted, all failed | `sync failed` (red)     | POST errors on all scopes       |
| No PS detected             | `local` (muted)         | Data saved locally only         |
| Not yet collected          | `new` (muted)           | Never connected                 |

### 3b. Post-connect messaging

After `vana connect github`:

**With PS available:**

```
Connected GitHub. 3 scopes synced to Personal Server.
  github.profile ✓
  github.repositories ✓
  github.starred ✓
```

**Without PS:**

```
Connected GitHub. Data saved locally.
  Path: ~/.vana/last-result.json
  Run `vana server sync` after starting your Personal Server.
```

**Partial failure:**

```
Connected GitHub. 2/3 scopes synced, 1 failed.
  github.profile ✓
  github.repositories ✓
  github.starred ✗ (400: schema not registered)
  Run `vana server sync` to retry.
```

### 3c. `vana status` shows per-source sync detail

```
→ Connected (1)
  GitHub [synced]  3/3 scopes · collected 2h ago

→ Personal Server
  http://localhost:8080 · healthy · 3 scopes stored
```

## Phase 4: Tests

### Unit tests

- `scope-resolver.test.ts` — dotted keys, flat keys with metadata, flat
  keys without metadata, metadata-key mismatch, empty result
- `client.test.ts` — health, ingestScope success/failure, listScopes,
  listVersions, auth header generation
- `ingestResult` integration — full pipeline with mocked client

### E2E smoke test (manual)

```bash
# Start personal server
cd ~/code/personal-server-ts && npm start

# Connect and verify
vana connect github
vana server status
vana server data
vana server data github.profile
```

## Implementation order

1. Phase 0a-0b — scope resolver + ingest fix (stops the lying)
2. Phase 0c — per-scope state tracking
3. Phase 1 — PS client extraction
4. Phase 2a-2b — config persistence + server status
5. Phase 3 — honest UX labels and messaging
6. Phase 2c-2d — server data + server sync commands
7. Phase 4 — tests throughout
8. Phase 0d — verification (depends on auth story with PS team)

## Open questions for PS team

1. **Schema registration** — are all connector scopes registered on
   Gateway? If `github.profile` isn't registered, `POST /v1/data/github.profile`
   returns 400. Who registers schemas — connector authors or PS team?
2. **Auth for non-localhost** — tunneled PS uses FRP with a public URL.
   Should ingest require a devToken? Web3Signed? Or is the tunnel itself
   the auth boundary?
3. **Bulk ingest** — DataConnect POSTs scopes one at a time. For CLI with
   many scopes, would a batch endpoint help? Or is per-scope fine?
4. **Scope format** — confirm `{source}.{key}` is canonical. The PS regex
   allows 2-3 segments (`a.b` or `a.b.c`). Do any connectors use 3?

## Risk notes

- **Gateway schema validation** is the biggest unknown. If schemas aren't
  registered, ingest will fail even with correct scope names. We should
  test against the live PS before shipping.
- **The `as string` cast on `terminal-image` import** is a hack that
  should be revisited when we decide the icon rendering story.
- **Per-scope state increases state file complexity.** Keep the schema
  additive — old state files without `ingestScopes` should still work.

## Release

Push to `feat/connect-cli-v1` for canary release after each phase.
Phase 0 (stop lying) ships first, even before the polished UX.
