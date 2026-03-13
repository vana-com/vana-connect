# Execution Context Memo

This memo captures the important architectural/product context from the `vana-connect` CLI/SDK work, without the low-value build/release churn.

## Core Product Shape

The right CLI surface is still:

- `vana connect <source>`
- `vana sources`
- `vana status`
- `vana setup`

This should remain one coherent system for both humans and coding agents, with one command model and mode-based behavior:

- human-friendly default output
- `--json`
- `--no-input`
- `--yes`

## Product / Repo Boundaries

The intended ownership model is:

- `vana-connect` owns the SDK + CLI + runtime
- `data-connect` should eventually consume the SDK
- the skill should consume the CLI
- `data-connectors` remains the source of truth for connectors, registry, and schemas

## Runtime Direction

We intentionally moved away from the old script-era runtime model.

Active direction:

- no active `run-connector.cjs`
- no active copied `playwright-runner`
- no active `npm install` during `vana setup`
- in-process Playwright host
- capability-oriented runtime API
- preserve connector compatibility
- preserve headed fallback

Important API principle:

- do not leak raw Playwright objects as the public/runtime API surface
- expose explicit runtime capabilities instead

## Future Seams To Preserve

The runtime/SDK structure should stay open for:

- alternate execution backends
- alternate browser/profile strategies
- richer desktop mediation and debugging
- local vs cloud Personal Server targets

## SEA / Packaging Lesson

Do not ship a fully bundled SEA blob for Playwright.

The correct distribution model is:

- SEA as a launcher
- real on-disk app payload

This preserves:

- no user-facing Node/npm prerequisite
- reliable Playwright runtime semantics
- the clean in-process runtime architecture

## Release / Publish Lesson

The npm canary workflow must build before publish.

Add tarball content validation so empty or incomplete publishes cannot silently recur.

## Recommended Conversation Rewind Point

If context needs to be reset, rewind to around the clean runtime redesign discussion:

- “I’m aligned with proceeding toward a clean #3. What choices does that leave that we need to make?”

That keeps the useful architectural conclusions while discarding most of the later SEA / CI / installer / npm publish troubleshooting noise.
