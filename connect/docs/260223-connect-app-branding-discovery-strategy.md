# Connect app branding discovery strategy

## Why this exists

Current connect UI branding uses local registry fallback (`app-registry.ts`), which does not scale and creates maintenance friction.

Goal: make branding work for builders by default with minimal setup.

## Problem

We need `displayName`, `iconUrl`, and visual colors (`iconBg`, `iconFg`) for the connect UI.

Today this is sourced from:

- query hints (`app`, `appId`, `appName`)
- static local registry mapping in connect app
- hardcoded fallback

This requires manual registry upkeep and does not auto-discover new apps.

## Desired builder experience

Builder can do one of:

1. pass only `appName` (minimum)
2. pass typed branding hints in launch params (optional)
3. pass nothing and still get reasonable branding via app metadata discovery

No per-app registry edit should be required for normal flows.

## Proposed source precedence (branding)

Resolve branding in this order:

1. **Explicit launch hints** (query/session metadata)  
   Example: `appName`, optional `iconUrl`, optional `themeColor`.
2. **Session-derived app origin metadata** (server fetched)  
   Fetch app manifest/metadata from origin associated with launch context.
3. **Static registry fallback** (legacy safety net)
4. **Default generic branding**

This keeps existing reliability while removing registry dependency for new apps.

## Architecture

## Shared contract

Introduce shared branding hint types/constants (in shared package or shared module):

- `ConnectAppBrandingHint`
- query key constants and parser
- validation helpers

Purpose: builders and connect app speak one typed query contract.

## Connect server endpoint

Add server route:

- `GET /api/app-branding`

Input:

- launch context (`sessionId`, optional `secret`) or resolved app origin

Behavior:

- resolve app origin from launch/session metadata
- fetch manifest/metadata server-side (avoid browser CORS issues)
- normalize result into connect branding shape:
  - `displayName`
  - `iconUrl`
  - `iconBg`
  - `iconFg`
- short TTL cache by app origin

## Connect client flow

In connect page hook:

- resolve immediate branding from hints/fallback (fast first paint)
- fetch enriched branding async from `/api/app-branding`
- update UI when enriched data arrives

This avoids blocking critical handoff/auth flow on metadata fetch latency.

## Metadata extraction strategy

Preferred extraction order:

1. Web app manifest (`/manifest.json`)
2. HTML metadata (`<meta property="og:...">`, `<title>`, icon links)
3. `/favicon.ico` fallback

Color strategy:

- if explicit theme/color token exists -> use it
- else derive from icon dominant colors (optional phase 2)
- else fallback neutral palette

## Security and trust boundaries

- Treat branding as presentation-only; never use it for auth/security decisions.
- Keep auth/session verification separate from branding fetch.
- Validate and sanitize remote metadata before rendering.

## Rollout plan

1. Keep current registry behavior as fallback (no breakage).
2. Add typed hints + parsing path.
3. Add server branding endpoint and caching.
4. Switch connect UI resolver to dynamic-first with fallback chain.
5. Measure unknown-app fallback rate and remove most registry entries over time.

## Success criteria

- New apps render correct name/icon without registry edits.
- Connect flow remains deterministic under metadata fetch failures.
- No auth regressions introduced by branding discovery logic.

## Non-goals

- Replacing auth handoff contract.
- Blocking connect flow on branding network calls.
- Perfect visual brand matching for all edge-case sites in v1.
