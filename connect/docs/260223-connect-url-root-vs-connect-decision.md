# Connect URL root-vs-connect decision

## Why this note exists

We need a clear decision on whether account launch URLs should target:

- `/connect?...` (current SDK canonical behavior), or
- `/?...` (root-first behavior).

This came up because the example app currently rewrites `/connect?...` to `/?...` before opening account.

## What the code does today

### SDK (`src/server/connect.ts`)

- `connect()` currently returns `connectUrl` as `https://account.../connect?...`.
- It always includes `sessionId`.
- It includes `secret` when present in the relay deep link.

### React fallback (`src/react/useVanaConnect.ts`)

- If the server does not provide `connectUrl`, hook fallback is also `/connect?sessionId=...`.

### Example app (`examples/nextjs-starter/src/components/ConnectFlow.tsx`)

- The example UI rewrites `/connect?...` to `/?...` before opening the link.
- Query params are preserved.
- This is example-only behavior; not SDK-wide behavior.

### Connect web app (`connect/` app)

- The app has explicit route semantics for `/connect` and `/login`.
- Root path middleware only runs on `/` and canonicalizes handoff/login behavior from root query state.
- Login flow persists/rebuilds handoff context and redirects back to `/connect?...` after auth.

## Clarification on "login before connect"

The "login before connect" behavior is true for the `connect` app flow:

- unauthenticated launch context leads to login,
- then post-auth destination resolves to `/connect?...`.

So yes: we already enforce login-gated connect behavior in the app flow.

## Risk analysis

### If we change SDK canonical URL to root now (`src/server/connect.ts` -> `/`)

- It changes behavior for every SDK consumer, not just the example app.
- It requires matching updates to fallback generation in `src/react/useVanaConnect.ts`.
- It requires test updates (server connect tests currently assert pathname `/connect`).
- It may invalidate assumptions in docs/tests around `/connect` as canonical route.

### If we keep SDK canonical `/connect` and only root-rewrite in example

- No SDK contract change.
- No downstream breaking behavior.
- We still get desired account opening behavior in example (`/` first) when that is preferred.

## Recommendation

Best short-term decision:

1. Keep SDK canonical URL as `/connect?...` for stability.
2. Keep root-first behavior as an app-level or example-level policy.
3. Simplify the example rewrite logic (if we keep it) to a single URL parse path rewrite with query preserved.

This gives us:

- stable SDK contract,
- root-first UX where desired,
- zero forced migration for existing integrators.

## Optional future cleanup

If product direction decides root-first should be canonical everywhere, do it as a deliberate, versioned change:

1. Update `src/server/connect.ts` to emit `/?...`.
2. Update fallback in `src/react/useVanaConnect.ts`.
3. Update tests/docs/changelogs in one PR.
4. Call out behavior change in release notes.

## Bottom line

- Current system works.
- Root-first can be done safely at the app/example layer today.
- Global SDK change to root should be intentional, bundled, and communicated.
