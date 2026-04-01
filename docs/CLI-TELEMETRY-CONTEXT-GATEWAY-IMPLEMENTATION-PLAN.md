# CLI Telemetry Context-Gateway Implementation Plan

_April 1, 2026_

## Goal

Stand up a production telemetry ingestion service for the Vana CLI at:

- `https://telemetry.opendatalabs.com`

The first concrete delivery should be a `context-gateway` PR from a dedicated
worktree that:

- accepts versioned CLI telemetry events
- validates and stores them durably
- exposes a minimal health surface
- is safe for anonymous-by-install ingestion
- is narrow enough to support the initial connector-reliability use case
- is broad enough to become the long-term telemetry backend for the CLI

This plan treats connector reliability as the first major consumer of the
telemetry system, not the entire telemetry system.

## Key Decisions

### 1. Put telemetry on the `apps/api` side of `context-gateway`

Use `apps/api` as the home for telemetry ingestion.

Why:

- it already owns database-backed server routes
- it is the right place for write-heavy machine traffic
- it avoids mixing telemetry ingestion with the dashboard/demo app surface
- it keeps `telemetry.opendatalabs.com` as an API service, not a page app

### 2. Use the dedicated hostname with clean top-level API paths

Expose these first routes on the telemetry host:

- `GET /v1/health`
- `POST /v1/cli/events`

Do not put the telemetry host behind `/api/...` on day one. The hostname is
already dedicated.

### 3. Anonymous-by-install, not account-linked by default

The CLI should send:

- a random local `install_id`
- a per-run `run_id`
- a per-event `event_id`

It should not send:

- user account IDs
- wallet addresses
- Personal Server URLs
- API keys or tokens
- file paths
- raw args
- logs or payload content

### 4. Make ingestion idempotent

The endpoint must support safe retry from the CLI without duplicate rows.

That means:

- every event has a client-generated `event_id`
- the database enforces uniqueness on `event_id`
- the API returns accepted vs duplicate counts

### 5. Ship one minimal internal read path in the first PR

The first `context-gateway` PR should ship:

- ingestion
- storage
- validation
- basic operational health
- one internal summary endpoint
- one simple internal admin page
- documentation

It should not ship a full analytics product, but it should give the team one
browser-visible answer to "which connectors are unhealthy right now?"

### 6. Keep public write traffic and internal read traffic on different hosts

Use:

- `telemetry.opendatalabs.com` for anonymous CLI writes
- `api.opendatalabs.com/api/v1/...` for authenticated internal reads

Why:

- the telemetry host should stay write-only and non-browser-oriented
- the dashboard already talks to the API host with Privy bearer tokens
- this avoids inventing CORS for the telemetry host
- this keeps internal admin reads on the existing authenticated surface

### 7. Do not build a new admin role system in v1

For the admin page, use verified email-domain access, not a new roles table.

Recommended v1 rule:

- allow authenticated users whose verified email ends with
  `@opendatalabs.xyz`

Recommended escape hatch:

- optional exact-email allowlist via env var for contractors or exceptions

This should be enforced server-side on the API host.

## What The First PR Should Deliver

## Host And Routing

Attach `telemetry.opendatalabs.com` to the same Vercel project as
`apps/api`.

Result:

- `api.opendatalabs.com` continues to serve the existing public API
- `telemetry.opendatalabs.com` serves the new telemetry-only routes

No root-app host rewrite is required for the first version.

### Required route files

Add:

- `apps/api/src/app/v1/health/route.ts`
- `apps/api/src/app/v1/cli/events/route.ts`
- `apps/api/src/app/api/v1/internal/cli/summary/route.ts`
- `apps/api/src/app/api/v1/account/profile/route.ts`
- `src/app/admin/telemetry/page.tsx`

Optional but useful:

- `apps/api/src/app/route.ts`
  - return a small JSON service document on `/`

## Data Model

Add one first-class raw events table.

### New table

`telemetry_cli_events`

Recommended columns:

- `id uuid primary key default random`
- `eventId text not null unique`
- `eventVersion integer not null`
- `eventName text not null`
- `eventTimestamp timestamp not null`
- `receivedAt timestamp not null default now()`
- `installId text not null`
- `runId text not null`
- `command text not null`
- `subcommand text`
- `source text`
- `connectorVersion text`
- `authMode text`
- `platform text`
- `os text`
- `arch text`
- `cliVersion text not null`
- `channel text`
- `installMethod text`
- `ci boolean not null default false`
- `agent boolean not null default false`
- `interactive boolean`
- `outcome text`
- `errorClass text`
- `durationMs integer`
- `storedScopeCount integer`
- `failedScopeCount integer`
- `batchId text`
- `requestUserAgent text`
- `metadata jsonb`
- `createdAt timestamp not null default now()`

### Indexes

Add indexes on:

- `eventName`
- `receivedAt`
- `source`
- `outcome`
- `connectorVersion`
- `command`

Do not store IP addresses in the table in v1.

If abuse analysis later requires request-origin tracking, add it explicitly in a
separate field and document the privacy change first.

## Ingestion Contract

## Endpoint

`POST /v1/cli/events`

### Request shape

Use a batched envelope:

```json
{
  "batchId": "01JQ...",
  "sentAt": "2026-04-01T18:00:00.000Z",
  "client": {
    "name": "vana-cli",
    "version": "0.12.0"
  },
  "events": [
    {
      "eventId": "01JQ...",
      "eventVersion": 1,
      "timestamp": "2026-04-01T17:59:59.000Z",
      "installId": "inst_...",
      "runId": "run_...",
      "eventName": "connect_completed",
      "command": "connect",
      "subcommand": null,
      "source": "github",
      "connectorVersion": "1.3.2",
      "authMode": "interactive",
      "platform": "darwin-arm64",
      "os": "darwin",
      "arch": "arm64",
      "cliVersion": "0.12.0",
      "channel": "canary",
      "installMethod": "homebrew",
      "ci": false,
      "agent": false,
      "interactive": true,
      "outcome": "connected_and_ingested",
      "errorClass": null,
      "durationMs": 18234,
      "storedScopeCount": 3,
      "failedScopeCount": 0,
      "metadata": {
        "dataState": "ingested_personal_server"
      }
    }
  ]
}
```

### Response shape

Return `202 Accepted` for successful batches:

```json
{
  "ok": true,
  "accepted": 12,
  "duplicates": 0,
  "dropped": 0
}
```

Return `400` for schema failures, `413` for oversized payloads, and `429` for
rate-limited requests.

### Validation rules

- request body must be JSON
- `events` required
- max batch size: `100`
- max request body: `64kb`
- `eventId`, `installId`, `runId`, `eventName`, `command`, `cliVersion`,
  `eventVersion`, `timestamp` required
- `metadata` allowed, but bounded and validated as object-like JSON
- reject unknown giant nested structures; do not allow arbitrary blob uploads

### v1 metadata policy

Allow `metadata` only for low-risk structured fields that do not justify
first-class columns yet.

Examples:

- `dataState`
- `phase`
- `retryable`
- `transport`

Never use `metadata` as a loophole for raw logs or user content.

## Telemetry Event Vocabulary

The server should be ready for the following event families from the CLI:

- `command_started`
- `command_completed`
- `command_failed`
- `runtime_check_completed`
- `runtime_install_started`
- `runtime_install_completed`
- `runtime_install_failed`
- `update_check_completed`
- `connector_update_applied`
- `login_started`
- `login_authorized`
- `login_failed`
- `connect_started`
- `input_required`
- `collection_completed`
- `collection_failed`
- `ingest_completed`
- `ingest_partial`
- `ingest_failed`
- `ingest_skipped`
- `server_sync_completed`
- `skill_installed`
- `mcp_started`
- `schedule_added`
- `detached_run_spawned`

This is broader than connector reliability by design.

## Security And Abuse Controls

This endpoint is anonymous by default, so it must be strict.

### First PR safeguards

- POST-only ingest route
- JSON-only body
- body size cap
- batch size cap
- unique `eventId`
- no browser CORS support by default
- tight validation
- explicit timeout handling
- no response echoing of submitted events

### Suggested host behavior

For `telemetry.opendatalabs.com`:

- do not mirror `Origin`
- do not enable browser credentialed CORS
- return no permissive `Access-Control-Allow-Origin` header for the ingest route

This is a CLI service, not a browser API.

### Abuse controls to wire in during or right after PR 1

- Vercel WAF / rate limiting if available
- server-side per-request batch limits
- structured logs on reject paths
- optional allowlist for `User-Agent` prefixes later if needed

Do not require a shared secret in the CLI for v1. It adds complexity without
real security if the client is publicly distributed.

## Privacy Boundary

This service should assume the CLI remote telemetry stream is intentionally
narrow.

### Allowed remotely

- command
- source
- connector version
- outcome
- coarse error class
- duration
- CLI version
- platform and install method
- scope success/failure counts
- agent/CI/interactive flags

### Not allowed remotely

- raw args
- file paths
- prompts or prompt responses
- tokens or codes
- result payloads
- Personal Server URLs
- logs
- screenshots
- wallet addresses

The `context-gateway` PR should document this boundary in code comments and
route docs so the later CLI PR does not drift.

## Context-Gateway File Plan

Expected primary write set in `context-gateway`:

- `apps/api/src/app/v1/health/route.ts`
- `apps/api/src/app/v1/cli/events/route.ts`
- `apps/api/src/app/api/v1/internal/cli/summary/route.ts`
- `apps/api/src/app/api/v1/account/profile/route.ts`
- `apps/api/src/lib/telemetry/schema.ts`
- `apps/api/src/lib/telemetry/normalize.ts`
- `apps/api/src/lib/telemetry/store.ts`
- `apps/api/src/lib/telemetry/admin.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/db/migrations/<new migration>.sql`
- `apps/api/src/db/migrations/meta/*`
- `apps/api/package.json`
  - only if a new validator dependency is added
- `src/app/admin/telemetry/page.tsx`
- `src/hooks/useTelemetrySummary.ts`
- `docs/`
  - add a service/API doc for telemetry ingestion

Optional:

- `packages/contracts/`
  - if you want the route documented as part of the public API contract

I would keep the first PR local to `apps/api`, the dashboard admin page, and
docs unless there is a strong reason to add shared-contract plumbing
immediately.

## Validation Library Choice

Use `zod` in `apps/api` unless there is a repo-level reason not to.

Why:

- easy to keep the schema explicit
- good error handling for reject paths
- simple to derive a normalized server shape

If avoiding a new dependency is more important, write a small explicit parser,
but only if it stays strict.

## Operational Read Path

The first PR does need a way to answer:

- which connectors are failing?
- on which versions?
- on which platforms?
- after which auth modes?

### Internal summary route

Add an internal-only endpoint on the existing API host:

- `GET /api/v1/internal/cli/summary`

Why this path:

- the dashboard already uses `NEXT_PUBLIC_API_URL`
- the dashboard already authenticates with Privy bearer tokens
- this avoids opening CORS on `telemetry.opendatalabs.com`

### Route auth model

Guard the route with:

- `authenticatePrivyRequest(request)`
- verified-email access rule

Recommended helper:

- `isTelemetryAdminEmail(email: string | null): boolean`

Recommended config:

- `TELEMETRY_ADMIN_DOMAINS=opendatalabs.xyz`
- `TELEMETRY_ADMIN_EMAILS=` optional comma-separated exact allowlist

### Profile sync requirement

Because the current API auth path only knows `auth.email` if the account
profile has been synced, add:

- `POST /api/v1/account/profile`

This route should:

- require a valid Privy bearer token
- accept `email` and `name`
- call `upsertAccountProfile(...)`
- return the stored profile

The admin page should call it before fetching the telemetry summary.

### SQL still matters

Even with the internal summary route, add example SQL for:

- source success rate over 7d
- error rate by source + connector version
- median connect duration by source
- ingest failure rate by source

## Simple Admin Dashboard

If you want a dashboard immediately, keep it extremely small and internal.

Recommended first page:

- `dashboard.opendatalabs.com/admin/telemetry`

Recommended first page goal:

- answer "which connectors are unhealthy right now?"

### What the first page should show

One table, no heavy charts, no BI layer.

Columns:

- source
- attempts in last 24h
- success rate in last 24h
- ingest success rate in last 24h
- median duration
- latest connector version seen
- top error class
- last seen at

Default sort:

- lowest success rate first, with a minimum-attempt threshold

### Backing API for the first page

Add one internal-only summary endpoint:

- `GET /api/v1/internal/cli/summary`

It should return:

- overall totals for the last 24h
- per-source rollups for the last 24h

That is enough for the first dashboard.

### Access control

Gate the page to internal users only, but do not create a new admin table in
v1.

Recommended first pass:

- authenticated Privy session in the dashboard
- derive preferred email from the Privy user object
- sync that email to the API via `POST /api/v1/account/profile`
- fetch summary from the API host with the same bearer token
- authorize server-side if the stored email matches an allowed company domain
  or exact allowlist entry

Do not rely on client-side email checks alone. The page can hide itself in the
UI, but the API route must still enforce the rule.

### Why this is the right v1 access design

- no separate admin-user database
- no manual role-management UI
- works with the existing Privy login model
- uses company-controlled email ownership as the trust boundary
- easy to replace later with explicit roles if needed

### What not to build yet

- per-install drilldowns
- trend chart library
- alerting UI
- arbitrary query builder
- cohort/product analytics views

For a startup at the stage you described, the Plaid-like move is to build an
ops console first, not a telemetry platform.

## Worktree And PR Plan

## Worktree creation

From `~/code/context-gateway`:

```bash
git fetch origin
git worktree add ../context-gateway-telemetry -b feat/cli-telemetry-ingest origin/main
cd ../context-gateway-telemetry
```

Suggested branch:

- `feat/cli-telemetry-ingest`

## PR scope

PR title:

- `feat(api): add CLI telemetry ingestion service`

PR description should state:

- new custom host: `telemetry.opendatalabs.com`
- new routes: `/v1/health`, `/v1/cli/events`
- new internal route: `/api/v1/internal/cli/summary`
- anonymous-by-install telemetry ingest
- privacy restrictions
- idempotent event storage with dedupe

## Suggested implementation sequence inside the worktree

1. Add DB schema and migration for `telemetry_cli_events`.
2. Add telemetry validation and normalization helpers.
3. Add `GET /v1/health`.
4. Add `POST /v1/cli/events`.
5. Add dedupe and partial-count response handling.
6. Add `POST /api/v1/account/profile` for authenticated profile sync.
7. Add one internal summary endpoint for per-source rollups.
8. Add one simple admin page at `/admin/telemetry`.
9. Add route docs and example payloads.
10. Add tests or route-level smoke coverage.
11. Add SQL examples for deeper ad hoc analysis.

## Testing Plan For The Context-Gateway PR

## Automated

- migration builds cleanly
- TypeScript passes
- route handler unit tests or integration-like tests for:
  - valid batch accepted
  - duplicate `eventId` ignored/counts as duplicate
  - oversize batch rejected
  - malformed event rejected
  - missing required fields rejected

## Manual local smoke test

Run the API app locally and verify:

```bash
curl -i http://localhost:3002/v1/health
```

and:

```bash
curl -i \
  -X POST http://localhost:3002/v1/cli/events \
  -H 'Content-Type: application/json' \
  --data @sample-telemetry-batch.json
```

Verify:

- rows are inserted
- duplicate posts do not duplicate rows
- malformed payloads fail cleanly

## Preview / production smoke

After the Vercel preview is up and the custom domain is attached:

```bash
curl -i https://telemetry.opendatalabs.com/v1/health
```

Then post a one-event canary batch and confirm it lands in the DB.

## Follow-Up CLI Work

This is out of scope for the first `context-gateway` PR but should be planned
now so the ingest contract is right.

## Vana CLI changes

In `vana-connect-2`:

- add local telemetry config and `install_id`
- add event generation
- add queue/spool file under `~/.vana/telemetry/`
- add async uploader to `https://telemetry.opendatalabs.com/v1/cli/events`
- add `vana telemetry status|enable|disable`
- add `VANA_TELEMETRY_DISABLED=1`
- add `VANA_TELEMETRY_DEBUG=1`
- update README/privacy copy before default-on shipping

## Recommended rollout sequence

1. Merge `context-gateway` ingest service first.
2. Verify telemetry host health and DB writes manually.
3. Land CLI instrumentation behind an explicit temporary gate if needed.
4. Update CLI docs and trust copy.
5. Only then enable default sending in a canary release.

## Risks

### 1. Scope creep into analytics UI

Avoid turning PR 1 into a full observability product.

### 2. Privacy drift

If `metadata` is left too loose, the CLI will eventually push too much.

### 3. Duplicate rows from retries

This is why `eventId` uniqueness is mandatory.

### 4. Abuse on an anonymous public endpoint

Mitigate with strict validation, small payload limits, and host-level controls.

### 5. Contract drift between repos

The route doc must be explicit enough that the later CLI PR can implement it
without guessing.

### 6. Email-domain access drift

If the admin route depends on `auth.email` and the dashboard never syncs the
profile, valid internal users will be locked out.

This is why the profile-sync route should ship in the same PR as the admin
page.

## Benchmark Audit

This plan now looks directionally correct relative to the public patterns I
could verify from Vercel, Stripe, Plaid, and Linear.

### Vercel / Turborepo

What public docs show:

- Vercel documents CLI telemetry controls and inspection surfaces
- Turborepo uses a dedicated telemetry host in public examples

Why our plan is aligned:

- public telemetry traffic is isolated to `telemetry.opendatalabs.com`
- internal dashboard reads do not share the anonymous write surface
- the plan keeps the public service narrow and operational

Reference:

- <https://vercel.com/docs/cli/about-telemetry>
- <https://vercel.com/docs/cli/telemetry>
- <https://turborepo.com/docs/telemetry>

### Stripe

What public docs show:

- Stripe CLI telemetry is narrow and operational
- public package docs show a dedicated telemetry endpoint

Why our plan is aligned:

- the payload is intentionally small
- sensitive user content is explicitly excluded
- deduped batch ingest is designed for reliability, not marketing analytics

Reference:

- <https://github.com/stripe/stripe-cli>
- <https://pkg.go.dev/github.com/stripe/stripe-cli/pkg/stripe>

### Plaid

What public docs show:

- Plaid exposes status and debugging surfaces for operational diagnosis
- Plaid Dashboard includes debugging tools for specific failing items

Why our plan is aligned:

- the first dashboard is an ops console, not a BI product
- the first read view is a connector health table, not a generic analytics
  builder
- the design starts with failure diagnosis and reliability ownership

Reference:

- <https://plaid.com/docs/api/>
- <https://support.plaid.com/hc/en-us/articles/16124071331479>

### Linear

What public docs show:

- Linear dashboards are centralized views for metrics, trends, and tables

Why our plan is intentionally simpler:

- we only need one internal reliability table first
- we should earn the right to more charts after the connector-health loop is
  actually used

I could not verify a public Linear CLI telemetry program, so Linear is useful
here as a product-quality bar for internal tooling simplicity, not as a direct
telemetry precedent.

Reference:

- <https://linear.app/docs/dashboards>

## Acceptance Criteria For The Context-Gateway PR

The PR is done when:

- `telemetry.opendatalabs.com/v1/health` returns healthy
- `POST /v1/cli/events` accepts valid batches
- duplicate `eventId`s do not create duplicate rows
- the database stores enough fields to answer connector reliability questions
- the endpoint rejects oversized or malformed payloads
- the privacy boundary is documented in code/docs
- there is a repeatable manual verification path for preview and production
- internal users with allowed company emails can view a simple connector health
  table at `dashboard.opendatalabs.com/admin/telemetry`

## Bottom Line

The right first move is not to add telemetry directly to the CLI and hope the
backend catches up.

The right first move is:

1. stand up a dedicated ingestion service in `context-gateway`
2. make it strict, idempotent, and privacy-bounded
3. verify it on `telemetry.opendatalabs.com`
4. then wire the CLI to it in a follow-up PR

That gives Vana a telemetry system it can actually depend on, instead of a
connector-specific patch that will need to be replaced immediately.
