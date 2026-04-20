## ADDED Requirements

### Requirement: Connector page API exposes `requestData`

The connector page API SHALL provide a `requestData(payload)` method returning `InteractionResult<Record<string, string>>`.

#### Scenario: Success in interactive mode

- **WHEN** a connector calls `requestData({ schema, message })` in a runtime with an available user input channel
- **THEN** the runtime SHALL collect the input and return `{ status: "success", data }` where `data` matches the requested schema

#### Scenario: Skipped in no-input mode

- **WHEN** a connector calls `requestData(...)` in a runtime where no user input channel is available for this invocation
- **THEN** the runtime SHALL return `{ status: "skipped", reason: "no-input" }` or `{ status: "skipped", reason: "no-headed-browser" }` as appropriate, without throwing

#### Scenario: Skipped return is not persisted as collected data

- **WHEN** a connector returns `{ status: "skipped", reason: "no-input" }` (or any other skipped result) as its top-level return value
- **THEN** the runtime SHALL NOT persist that object as the connector's collected data

### Requirement: Connector page API exposes `requestManualAction`

The connector page API SHALL provide a `requestManualAction(message, checkFn, options?)` method returning `InteractionResult<void>`.

#### Scenario: Success after manual action

- **WHEN** a connector calls `requestManualAction(message, checkFn, options)` in a runtime with a headed browser available and the user completes the action
- **THEN** the runtime SHALL return `{ status: "success" }` once `checkFn()` resolves truthy

#### Scenario: Skipped in no-input mode

- **WHEN** a connector calls `requestManualAction(...)` in a runtime operating in `--no-input` mode (or equivalent) with a user-capable channel
- **THEN** the runtime SHALL return `{ status: "skipped", reason: "no-input" }` immediately without polling

#### Scenario: Skipped when no headed browser exists

- **WHEN** a connector calls `requestManualAction(...)` in a runtime that never surfaces a headed browser to the end user (e.g. context-gateway)
- **THEN** the runtime SHALL return `{ status: "skipped", reason: "no-headed-browser" }` immediately

#### Scenario: autoGoHeadless after success

- **WHEN** `requestManualAction` resolves successfully and `options.autoGoHeadless` is not `false`
- **THEN** the runtime SHALL transition the browser context back to a headless profile and navigate to `about:blank`

### Requirement: Skip reason vocabulary is documented and open

The contract SHALL define `SkipReason` as an extensible string union initially including `"no-input"` and `"no-headed-browser"`.

#### Scenario: Connector treats unknown reasons uniformly

- **WHEN** a connector receives `{ status: "skipped", reason }` with any `reason` value
- **THEN** the connector SHALL treat the result as "the interaction did not complete" and SHALL NOT branch on specific reason values unless explicitly intended

### Requirement: Old interaction APIs remain functional and are marked deprecated

The contract SHALL keep `requestInput`, `promptUser`, `showBrowser`, and `goHeadless` functional.

#### Scenario: Deprecated JSDoc annotations

- **WHEN** a developer imports `types/connector.d.ts`
- **THEN** the four old methods SHALL carry `@deprecated` JSDoc with a pointer to `requestData` / `requestManualAction`

#### Scenario: Old methods continue to work unchanged

- **WHEN** an un-migrated connector calls `requestInput`, `promptUser`, `showBrowser`, or `goHeadless`
- **THEN** the runtime SHALL honor the historical semantics of that method in that runtime (no behavior change)

### Requirement: All three runtimes implement the new methods before any connector migrates

Before any connector in `vana-com/data-connectors` is migrated to the new APIs, every runtime that runs that connector SHALL have shipped an implementation of `requestData` and `requestManualAction`.

#### Scenario: Runtime-first rollout

- **WHEN** a new method is added to the connector contract
- **THEN** `vana-connect`, `data-connect` (desktop), and `context-gateway` SHALL all publish/deploy implementations of that method before any connector script calls it
