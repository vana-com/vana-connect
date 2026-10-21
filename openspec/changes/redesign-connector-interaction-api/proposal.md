## Why

Connectors need to interact with the user in three situations: collect credentials, prompt for a manual browser action, or bail out cleanly when no user is available (`--no-input` mode, scheduled refresh, Context Gateway). Today there are three APIs for these situations — `requestInput`, `promptUser`, `showBrowser` — and each has a different `--no-input` failure mode:

- `requestInput` throws `NeedsInputError`.
- `showBrowser` returns `{ headed: false }`.
- `promptUser` silently polls forever (CLI / desktop) or throws (CG).

Connector authors have to remember three guard patterns for the same conceptual situation, and they routinely get it wrong. The already-fixed `legacyAuthTriggered` result-discard bug was a concrete instance: a connector collected valid data from cached cookies, returned it, and the runtime threw the result away because an internal flag said "legacy auth was triggered."

The connector API is shared by three runtimes — vana-connect's in-process runner, data-connect's playwright-runner sidecar, and Context Gateway's playwright-proxy. Each runtime has diverged subtly around user interaction (CG bans `promptUser` entirely; data-connect's `promptUser` hangs forever in no-input mode). Unifying the API under a result-object contract lets a single connector run cleanly on all three runtimes and makes "user unavailable" a first-class return value rather than a runtime-specific exception, log, or silent hang.

## What Changes

- Add `requestData(payload)` and `requestManualAction(message, checkFn, options?)` methods to the connector page API, each returning `InteractionResult` (`{ status: "success", data? }` or `{ status: "skipped", reason }`).
- Keep `requestInput`, `promptUser`, `showBrowser`, `goHeadless` unchanged for backward compatibility. Mark them `@deprecated` in the shared type contract.
- Update vana-connect's in-process runtime to implement the new methods and to recognize a `{ status: "skipped", reason: "no-input" }` return value as a non-result (do not persist as collected data).
- Update data-connect's `playwright-runner/index.cjs` to implement the new methods with the full headed-browser semantics.
- Update context-gateway's `playwright-proxy.ts` to implement the new methods with degenerate semantics: `requestData` proxies to the existing `getInput` channel; `requestManualAction` returns `{ status: "skipped", reason: "no-headed-browser" }` immediately.
- Migrate each connector in `vana-com/data-connectors` to the new APIs only after every runtime it targets has shipped the new methods. Rollout per connector is conditional, not atomic.
- Document the skipped-reason vocabulary (`"no-input"`, `"no-headed-browser"`) and the connector-author pattern for handling skipped returns.

## Capabilities

### New Capabilities

- `connector-interaction-api`: Defines the `requestData` / `requestManualAction` contract, the `InteractionResult` shape, the reason vocabulary, and runtime obligations for each of the three host runtimes.

### Modified Capabilities

None.

## Impact

- **Affected repos**: `vana-com/vana-connect` (this repo — runtime additions, already drafted as PR #102), `vana-com/data-connect` (desktop playwright-runner), `vana-com/context-gateway` (playwright-proxy), `vana-com/data-connectors` (type contract + connector migrations — drafted as PR #46).
- **Breaking changes**: None. Old APIs remain functional; migration is per-connector and can lag the runtime rollout.
- **Rollout dependency**: A connector using the new APIs will throw `TypeError` in a runtime that hasn't shipped them. Every runtime a connector targets must ship the new methods before that connector is migrated.
- **Publishing**: vana-connect runtime changes require an npm publish of `@opendatalabs/connect`. Desktop changes require a data-connect release. CG changes deploy via its own pipeline.
- **Retirement**: once migrations are broadly complete, `legacyAuthTriggered` and the `legacy-auth` event can be removed from vana-connect's runtime.
