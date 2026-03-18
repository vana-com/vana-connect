# `vana-connect` CLI State Model

_As of March 12, 2026_

## Purpose

This document defines the state model that the `vana connect` CLI should expose and reason about.

The goal is not to document every internal file. The goal is to make the product legible:

- what is installed?
- what is connected?
- where is data stored?
- is a Personal Server available?
- what happened last?

This state model is the foundation for:

- `vana connect status`
- first-run trust
- reconnect behavior
- future local/cloud Personal Server support

## Product stance

Users should not need to understand implementation internals to answer basic questions.

The CLI should make these things obvious:

- runtime state
- source state
- data state
- Personal Server state

## State domains

For MVP, the CLI should think in four domains:

- runtime
- sources
- data artifacts
- Personal Server target

## 1. Runtime state

This answers: can `vana connect` actually run connectors on this machine?

### Required runtime states

- `installed`
- `missing`
- `unhealthy`

### What runtime includes

- runner binary or runner directory
- browser/runtime dependencies
- expected local runtime files

### Current foundation

The existing skill uses `~/.vana/playwright-runner/` and `~/.vana/run-connector.cjs` as key runtime artifacts.

### CLI expectations

`vana connect status` should be able to say:

- runtime installed or not
- path to active runtime
- whether runtime looks healthy enough to execute connectors

## 2. Source state

This answers: what is the state of a specific connector/source such as Steam or GitHub?

### Required source states

- `unknown`
- `available`
- `installed`
- `session_present`
- `needs_auth`
- `last_run_succeeded`
- `last_run_failed`

These do not all need to be stored as a single field. They are observable states the CLI should be able to infer or record.

### What source state should capture

- whether the source is known in the registry
- whether the connector is present locally
- whether saved session/auth state exists
- whether the source has ever been run successfully
- whether the last known attempt failed

### Session state

For MVP, the important question is not “what exact auth backend are we using?”

It is:

- can we likely reuse a saved session?
- if not, will the user need to authenticate again?

### CLI expectations

`vana connect status` and optional `inspect` should be able to show:

- source known or not
- connector installed or not
- session likely reusable or not
- last run outcome

## 3. Data state

This answers: where did the user’s data actually end up?

This is one of the most important trust questions.

### Required data states

- `none`
- `collected_local`
- `ingested_personal_server`
- `ingest_unavailable`
- `ingest_failed`

### Why this matters

The CLI must not blur:

- “we successfully scraped the data”
- and
- “your Personal Server has it now”

Those are related but distinct outcomes.

### Current foundation

Today the headless flow clearly produces local result artifacts. The desktop app has explicit Personal Server ingestion logic. The CLI must make that distinction explicit instead of pretending they are the same thing.

### CLI expectations

After `vana connect <source>`, the user should understand:

- what data was collected
- whether it is only local
- whether it was ingested successfully
- where to look next

## 4. Personal Server target state

This answers: is there an active Personal Server target that the CLI can use?

### Product principle

The user should think in terms of:

- “my Personal Server”

Not:

- “some local app on localhost”
- “some cloud instance”
- “some protocol participant”

Implementation may vary. Product language should stay stable.

### Required target states for MVP

- `available`
- `unavailable`
- `unknown`

### What target state should eventually represent

- local desktop-bundled target
- self-hosted target
- cloud-hosted target

For MVP, the CLI does not need a big environment-management surface. It just needs to know enough to say:

- Personal Server reachable
- Personal Server not reachable
- ingest attempted or not attempted

### CLI expectations

`vana connect status` should ideally show:

- whether a Personal Server target is detected
- whether it appears reachable
- whether recent ingest succeeded

## Persisted vs derived state

Not all state needs its own database or manifest.

For MVP:

- prefer deriving state from existing files and runtime checks where possible
- record only the minimum additional metadata needed for a good UX

### Likely derived from existing artifacts

- runtime installed
- connector installed
- session folder exists
- last result file exists
- Personal Server reachable

### Likely worth recording explicitly

- last run outcome per source
- last ingest outcome per source
- last error summary per source
- timestamps for last successful collection and ingest

This can be very simple at first.

## Suggested MVP state record

If the CLI needs its own lightweight state file, it should be small and outcome-oriented.

Possible location:

- under `~/.vana/`

Possible shape:

```json
{
  "version": 1,
  "sources": {
    "steam": {
      "connectorInstalled": true,
      "sessionPresent": true,
      "lastRunAt": "2026-03-12T12:00:00Z",
      "lastRunOutcome": "connected_local_only",
      "lastIngestAt": null,
      "lastIngestOutcome": "not_attempted",
      "lastError": null
    }
  }
}
```

This is illustrative, not final.

## What `status` should summarize in MVP

At minimum, `vana connect status` should answer:

- is runtime installed?
- is a Personal Server target available?
- what sources are installed locally?
- which sources appear to have saved sessions?
- what was the last outcome for each source?
- is each source local-only or ingested?

This command should aim to answer the user’s practical question:

**“Can I trust that my data is connected and usable right now?”**

## How this supports future cloud support

This state model is intentionally environment-agnostic.

That matters because future Personal Server targets may be:

- local
- self-hosted
- cloud-hosted

If the CLI is built around:

- target availability
- target reachability
- ingest outcome

then it can support those futures without changing the user’s mental model.

## What not to do

Avoid these mistakes:

- surfacing raw internal file structure as the product state model
- treating “collected locally” and “ingested” as the same outcome
- forcing users to know which runtime implementation is active
- inventing a large config or environment system before MVP needs it

## Conclusion

The MVP state model should stay small and explicit.

The CLI needs to make four things legible:

- runtime health
- source connection state
- data location/outcome
- Personal Server availability

If those are clear, the product will feel much more trustworthy and much less improvised.
