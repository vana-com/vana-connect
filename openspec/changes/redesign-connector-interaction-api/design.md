## Context

The connector page API is shared across three runtimes:

- **vana-connect** `src/runtime/playwright/in-process-run.ts` — powers the `vana` CLI and the `@opendatalabs/connect` SDK.
- **data-connect** `playwright-runner/index.cjs` — the desktop Playwright sidecar.
- **context-gateway** `src/lib/playwright-proxy.ts` — the server-side proxy that runs connectors against a remote worker behind a fixed CG UI.

All three execute the same connector scripts from `vana-com/data-connectors` (the shared `*-playwright.js` files). Each runtime independently implements the page API, with no shared implementation layer. Divergence has crept in:

- vana-connect's `--no-input` mode enforces "user unavailable" behavior at the runtime level with three different mechanisms (throw / return value / silent poll).
- data-connect has no `--no-input` concept and `promptUser` polls forever if a user never acts.
- context-gateway has no headed browser to surface to the end user at all and has already banned `promptUser` at runtime by throwing.

## Goals

- One connector contract that all three runtimes can implement honestly.
- Make "user unavailable" a return value, not an exception, a silent hang, or a runtime-specific log.
- Let connector authors write one branch for "needs user" regardless of which runtime will host their script.
- Allow incremental rollout — old APIs keep working, connectors migrate one at a time.

## Non-goals

- Not unifying the three runtime implementations into a single shared module. They have legitimately different host constraints (CG has no surfaced browser; data-connect owns a real desktop browser; vana-connect is a headless per-invocation runner).
- Not removing the old four methods. They stay until every connector has migrated, which may take months.
- Not adding new capabilities (e.g. file upload, OAuth redirect) — this change is only about cleaning up what's already there.

## Decisions

### D1. Result-object contract, not thrown exceptions

The new methods return `InteractionResult<T>`:

```ts
type InteractionResult<T = void> =
  | { status: "success"; data?: T }
  | { status: "skipped"; reason: SkipReason };
```

Rejected: throwing a `UserUnavailableError` that connectors catch. Reason: the existing `NeedsInputError` pattern in `requestInput` is exactly what we're running away from. Exceptions make the happy-path code read as if the user is always present, which is backwards for headless-first runtimes.

### D2. `SkipReason` as an open vocabulary, initially `"no-input" | "no-headed-browser"`

`"no-input"` means "this runtime supports user input in principle but the current invocation is running without one."

`"no-headed-browser"` means "this runtime never has a headed browser for the end user" (CG).

Rejected: collapsing both into `"no-input"`. Reason: connector authors may want to differentiate. A connector running in CG can reasonably decide "we'll never have a user here, fall back to cached-cookie collection," whereas the same connector in CLI `--no-input` mode might emit a `needs-input` event asking a human to re-run with input. Same runtime response, different long-term signal.

Additional reasons can be added later (e.g. `"cancelled"`, `"timeout"`) without breaking existing consumers — connectors must treat `status: "skipped"` as "don't do the user-interaction thing" regardless of reason.

### D3. `requestManualAction` subsumes `showBrowser + promptUser + goHeadless`

The old flow was:

```js
const { headed } = await page.showBrowser(url);
if (!headed) return;
await page.promptUser("Complete login", () => loggedIn());
await page.goHeadless();
```

Three calls, three failure modes, no uniform skip semantics.

The new flow is:

```js
const r = await page.requestManualAction("Complete login", () => loggedIn(), {
  url,
  autoGoHeadless: true,
});
if (r.status === "skipped") return collectFromCachedCookies();
```

One call, one result. The runtime decides whether a headed browser is available; the connector decides what to do when it isn't.

### D4. Per-runtime skip semantics

- **vana-connect**: `requestManualAction` skips iff `request.noInput === true`. Reason: `"no-input"`.
- **data-connect**: same. Reason: `"no-input"`. (Introduces no-input plumbing if absent.)
- **context-gateway**: `requestManualAction` always skips. Reason: `"no-headed-browser"`. No headed browser is ever surfaced to the CG end user.

This is honest: CG isn't pretending to have a user that isn't there.

### D5. Rollout is runtime-first, connector-second

A connector using `requestData` or `requestManualAction` will throw `TypeError` in a runtime that hasn't shipped them. The dependency order is strict:

1. Runtime publishes the new methods.
2. Runtime ships (npm publish / CG deploy / desktop release).
3. Connectors targeting that runtime can start using the new methods.

Connectors in `data-connectors/` target all three runtimes. The pragmatic rule is: no connector migration merges until all three runtimes have shipped the new APIs.

Rejected: feature-detecting the new APIs in each connector (`if (page.requestData) ...`). Reason: doubles the code in every connector and defeats the point of the redesign.

### D6. Old APIs stay deprecated but functional indefinitely

Marked `@deprecated` in `types/connector.d.ts`. Not removed. The deprecation annotation is the IDE hint; the runtime keeps implementing them. Remove only after every connector has migrated, which is a separate future decision.

## Risks

- **Runtime drift**: each runtime owns its own implementation. If one of them drifts from the contract (e.g. data-connect forgets to wire `noInput` before adding `requestManualAction`), a migrated connector could hang. Mitigation: add the integration tests in tasks 1.5, 1.6, and 3.3 before migrating any connector.
- **CG honest-skip behavior changes connector outcomes**: today, calling `promptUser` in CG throws and the connector errors out. After the change, `requestManualAction` in CG returns skipped and the connector chooses what to do. This changes whether a session appears "failed" or "collected partial." Audit each migrated connector for this.
- **PR #46 staleness**: #46 was drafted before this plan. It will need a rebase and a per-connector review to make sure it's handling `skipped` results the way the plan intends.

## Open questions

- Should `requestData`'s `skipped` branch ever emit a `needs-input` event? (Currently #102 does not — it's a pure return. Event emission happens in `requestInput`'s `--no-input` throw path. Preserving symmetry says no, but some product surfaces may still want the event.)
- When should `legacy-auth` events actually be retired from vana-connect? Depends on whether any consumer outside this repo subscribes to them.
