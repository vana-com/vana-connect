# Connect app organization: co-location first

This app uses a co-location model:

- Keep code local to the route that owns it.
- Promote code to broader scope only when multiple routes genuinely need it.
- Prefer explicit folder semantics (`_components`, `_lib`, `_auth`) over ambiguous names like `_shared`.

## Current route structure

`src/app` is organized by route policy, not migration history.

- `(public)` — routes that do not require an authenticated session.
  - `/login`
  - `/download-data-connect` (public entry, auth-aware actions)
- `(handoff)` — routes that are part of auth/session handoff flows.
  - `/connect`
  - `/logout`
- `admin` — authenticated workspace routes.
  - `/admin`
  - `/admin/apps`
  - guarded by `admin/layout.tsx`

## Folder semantics

Use these meanings consistently:

- `_components` — route-specific UI building blocks.
- `_lib` — route-specific pure logic/helpers/data mapping (no UI).
- `_auth` — cross-route auth primitives and auth flow helpers.
- route root files (`page.tsx`, `use-*.ts`, `*.ui-debug.ts`) — page-level orchestration and page-level hooks.

Do not add new `_shared` folders.

## Co-location rules

### 1) Default local

If only one route uses a module, keep it inside that route subtree.

Example:

- `src/app/(handoff)/connect/_components/connect-page-ui.tsx`
- `src/app/(handoff)/connect/_lib/app-registry.ts`
- `src/app/(handoff)/connect/use-connect-page.ts`

### 2) Promote only with real reuse

When a module is used across route boundaries, move it up one level into the narrowest shared scope.

Promotion path:

1. route-local (`(handoff)/connect/_lib/*`)
2. app-local shared (`src/app/_lib/*`, `src/app/_components/*`, `src/app/_auth/*`)
3. broader project scope (only if needed outside app routing)

### 3) Keep policy boundaries in layout when possible

Use route/layout boundaries for policy:

- `admin/layout.tsx` owns admin auth gating.
- `layout.tsx` owns global providers.

Avoid re-implementing the same guard in each page when a layout can enforce it once.

### 4) Keep global imports decoupled from route-group internals

Cross-cutting modules should not import from route-group-specific paths.

Good:

- `@/app/_lib/handoff-contract`

Avoid:

- importing `@/app/(handoff)/...` from middleware, root route, or app-global auth helpers.

## Practical checklist for new files

Before adding a file, ask:

1. Is this only for one route?
   - put it under that route (`_components` or `_lib`).
2. Is this used by multiple route groups?
   - move to `src/app/_lib` / `src/app/_components` / `src/app/_auth`.
3. Is this UI?
   - `_components`.
4. Is this non-UI logic?
   - `_lib`.
5. Is this auth/session orchestration used across routes?
   - `_auth`.

## Naming conventions

- `use-<feature>.ts` for page-level hooks at route root.
- `<feature>.ui-debug.ts` for page debug adapters at route root.
- `<feature>.test.ts` next to the module it tests.

## Intent

This structure optimizes for:

- local reasoning (open a route folder and see its whole flow)
- low-coupling refactors (move/rename route groups without breaking globals)
- explicit ownership boundaries (UI vs logic vs auth)
