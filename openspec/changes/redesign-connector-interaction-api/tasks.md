## 1. Contract and vana-connect runtime (this repo)

- [x] 1.1 Add `requestData(payload)` to `src/runtime/playwright/in-process-run.ts` returning `InteractionResult<Record<string,string>>`.
- [x] 1.2 Add `requestManualAction(message, checkFn, options?)` returning `InteractionResult<void>` and integrate with existing `ensureHeadedBrowser` / `reopenContext` helpers.
- [x] 1.3 Teach the post-connector result path to treat `{ status: "skipped", reason: "no-input" }` as a non-result.
- [x] 1.4 Add JSDoc on the old four methods (`requestInput`, `promptUser`, `showBrowser`, `goHeadless`) marking them `@deprecated` with a pointer to the new APIs.
- [ ] 1.5 Add an integration test covering `requestData` in `--no-input` mode (skipped) and in interactive mode (success).
- [ ] 1.6 Add an integration test covering `requestManualAction` in `--no-input` mode (skipped) and with `checkFn` eventually passing (success).
- [ ] 1.7 Cut a pre-release of `@opendatalabs/connect` that exposes the new APIs, publish to npm.

## 2. data-connectors type contract

- [ ] 2.1 Add `InteractionResult<T>`, `ManualActionOptions`, and the two new method signatures to `types/connector.d.ts`.
- [ ] 2.2 Add `@deprecated` JSDoc annotations on `requestInput`, `promptUser`, `showBrowser`, `goHeadless` in `types/connector.d.ts`.
- [ ] 2.3 Document `"no-input"` and `"no-headed-browser"` as the initial `reason` vocabulary in `skills/vana-connect/reference/PATTERNS.md`.
- [ ] 2.4 Update the connector template at `skills/vana-connect/templates/connector-script.js` to use the new APIs.
- [ ] 2.5 Rebase or recreate PR #46 on top of the new contract.

## 3. data-connect runtime

- [ ] 3.1 Add `requestData` and `requestManualAction` to `playwright-runner/index.cjs` with full headed-browser semantics matching vana-connect's behavior.
- [ ] 3.2 Ensure `requestManualAction` honors `request.noInput` (introduce the concept to this runtime if absent) and returns `{ status: "skipped", reason: "no-input" }` rather than polling forever.
- [ ] 3.3 Add a manual-run regression checklist covering one headed and one no-input connector invocation.
- [ ] 3.4 Cut a data-connect release containing the runtime changes.

## 4. context-gateway runtime

- [ ] 4.1 Add `requestData(payload)` to `src/lib/playwright-proxy.ts` that proxies the existing `getInput` channel and wraps the response in `{ status: "success", data }`.
- [ ] 4.2 Add `requestManualAction(...)` that immediately returns `{ status: "skipped", reason: "no-headed-browser" }` and logs the skipped message.
- [ ] 4.3 Update CG docs that currently document "`promptUser` is unsupported" to instead describe the new skip-based contract.
- [ ] 4.4 Keep the existing `promptUser` throw in place until migrations complete, then retire it.
- [ ] 4.5 Deploy CG with the new runtime methods.

## 5. Connector migrations (data-connectors)

- [ ] 5.1 Migrate `oura/oura-playwright.js`.
- [ ] 5.2 Migrate `github/github-playwright.js`.
- [ ] 5.3 Migrate `spotify/spotify-playwright.js`.
- [ ] 5.4 Migrate `linkedin/linkedin-playwright.js`.
- [ ] 5.5 Migrate `meta/instagram-playwright.js`.
- [ ] 5.6 Migrate `uber/uber-playwright.js`.
- [ ] 5.7 Migrate `shopify/shop-playwright.js`.
- [ ] 5.8 Migrate `openai/chatgpt-playwright.js`.
- [ ] 5.9 Migrate `google/youtube-playwright.js`.
- [ ] 5.10 Migrate `heb/heb-playwright.js`.
- [ ] 5.11 For each migrated connector, verify it runs successfully in every runtime it targets (CLI, desktop, CG) before merging its migration.

## 6. Retirement (post-migration)

- [ ] 6.1 Remove `runState.legacyAuthTriggered` and the `legacy-auth` event from vana-connect's runtime.
- [ ] 6.2 Replace CG's `promptUser` throw with the same skip-based return as `requestManualAction`.
- [ ] 6.3 Remove the deprecation JSDoc from old APIs if and when they are physically removed from the contract. (Likely much later; do not rush.)
