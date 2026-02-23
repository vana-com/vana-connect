# Connect app icon strategy (minimal contract)

## Decision

This replaces the previous overbuilt branding proposal.

For connect handoff, treat `sessionId` and `secret` as the only required auth fields.
For app identity in UI, use `appUrl` as the source of truth.

We will not depend on `app`, `appId`, or `appName` for correctness.
Those fields are legacy hints and may be absent or inconsistent.

## Goal

Render the app icon in the connect header block (app icon ↔ Vana icon) with minimal builder setup and no local per-app registry edits.

## Contract

Required for handoff/auth:

- `sessionId`
- `secret` (when provided by relay flow)

Required for reliable app icon resolution:

- `appUrl`

Optional legacy hints (best-effort only):

- `app`
- `appId`
- `appName`

## Branding resolution (v1)

Resolve header display metadata in this order:

1. `appUrl` provided
   - `iconUrl = new URL("/favicon.ico", appUrl)`
   - `displayName` fallback derived from hostname (`www.foo-bar.com` -> `Foo Bar`)
2. If `appName` exists, use it for display label (does not override icon source)
3. If favicon is missing/broken, show first-letter avatar fallback
   - first letter of resolved display name
   - fallback letter `"A"` if no usable name
4. Keep neutral default colors (no dynamic color extraction in v1)

## Builder experience

Builder should not pass custom branding hints.

Expected path:

- Builder config already contains `APP_URL`
- SDK `connect()` includes `appUrl` in generated account connect URL
- account connect page forwards `appUrl` through handoff flow
- connect UI derives favicon from `appUrl`

No extra builder action is needed beyond setting `APP_URL` (already required by starter config).

## Implementation scope

In scope now:

- Thread `appUrl` through SDK URL generation and handoff context
- Resolve icon from `/favicon.ico` at `appUrl` origin
- Use first-letter fallback when icon cannot load
- Keep existing auth/session behavior unchanged

Out of scope now:

- New `/api/app-branding` endpoint
- manifest scraping / OG metadata enrichment
- theme color extraction
- typed branding hint schema

## Rationale

- Matches what starter config can reliably provide today (`appUrl`)
- Removes dependence on unstable hint fields (`app`, `appId`, `appName`)
- Avoids introducing new server complexity for a simple UI requirement
- Keeps connect flow deterministic even when branding fails

## Success criteria

- App icon renders in connect header for apps with valid `appUrl`
- When favicon cannot be fetched, UI falls back to first-letter avatar without breaking flow
- No registry edit needed for new apps
- No auth/handoff regression
