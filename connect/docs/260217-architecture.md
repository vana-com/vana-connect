# Connect Web Flow Architecture (Auth + Grants)

This document defines the mental model and technical contract between:

- `/` auth experience (Vana Passport sign-in)
- `/grants` launch/download experience for DataConnect

It exists to answer: _what page should happen next after auth success_, based on **arrival context**.

This doc is architecture: flow semantics, routing contracts, and page responsibilities.

## Mental Model (User-facing)

There are two user journeys entering auth:

1. **Web-first journey**  
   User starts in web context and needs to continue into data permissions.
   - Auth success should continue to `/grants` (or future permissions route).

2. **Desktop-handoff journey**  
   User arrived at auth from an installed DataConnect app handoff (OS-level app flow).
   - Auth success should _not_ continue into grants page UX.
   - Success message should instruct return to app.
   - Auth should remain on success state (no redirect, no auto-close).

If we do not distinguish these journeys, users get the wrong success state.

## Arrival Context (Core Decision Input)

Arrival context is determined from auth page query params (and/or upstream generated redirect context).  
This context decides the auth success action.

### Proposed Context Modes

- `mode=continue_to_grants` (default web behavior)
- `mode=return_to_app` (desktop-handoff behavior)

Equivalent naming is fine (`entry=web|desktop`, `origin=app|web`) as long as one explicit param maps to one explicit post-success policy.

## Routing Contract Between Auth and Grants

Today, auth forwards selected grant context params:

- `app`
- `appId`
- `appName`

Auth computes `grantsUrl` and uses it for:

- fallback success link ("Didn't work? Click here")
- delayed redirect on success

Any arrival-context param used for success branching should be:

- parsed in `/_auth` on first load
- preserved through OAuth round-trips
- explicitly consumed by success transition logic

## Query Param Preservation Contract (Critical)

This is the highest-risk integration gap right now.
Teams may assume auth->grants carries all params, but current behavior is selective.

### Current observed behavior

| Param                           | Read in auth (`/`)             | Preserved through OAuth callback    | Forwarded to `/grants` URL                     |
| ------------------------------- | ------------------------------ | ----------------------------------- | ---------------------------------------------- |
| `mode`                          | Yes                            | Yes                                 | No (used only by auth success logic)           |
| `app`                           | Yes                            | Yes                                 | Yes                                            |
| `appId`                         | Yes                            | Yes                                 | Yes                                            |
| `appName`                       | Yes                            | Yes                                 | Yes                                            |
| `deepLinkUrl` / `deep_link_url` | Read by `/grants` launch logic | Not guaranteed by auth pass-through | Not currently added by auth grants URL builder |
| `sessionId`                     | Read by `/grants` launch logic | Not guaranteed by auth pass-through | Not currently added by auth grants URL builder |
| `secret`                        | Read by `/grants` launch logic | Not guaranteed by auth pass-through | Not currently added by auth grants URL builder |
| `scopes`                        | Read by `/grants` launch logic | Not guaranteed by auth pass-through | Not currently added by auth grants URL builder |

### Decision needed (within next 24 hours)

Define one explicit contract and align all repos:

1. **Minimal contract (current-ish):** only `app/appId/appName` are guaranteed at `/grants`.
2. **Launch-complete contract:** auth guarantees pass-through for launch-critical params (`deepLinkUrl`, `sessionId`, `secret`, `scopes`) as well.

Without this decision, downstream integrations can silently break after OAuth redirects.

## Success Behavior Matrix

| Arrival context | Auth success copy                                | Auth success action                       |
| --------------- | ------------------------------------------------ | ----------------------------------------- |
| Web-first       | "Redirecting you to your data permissions..."    | Redirect to `/grants` after delay         |
| Desktop-handoff | "Return to DataConnect. You may close this tab." | Stay on auth success screen (no redirect) |

## Current vs Target

Current:

- Auth success is context-aware:
  - `mode=return_to_app` -> stay on auth success screen (no redirect).
  - any other mode / missing mode -> redirect to `grantsUrl` after delay.
- `/grants` renders with no back button.

Target:

- Keep the above success behavior stable.
- Finalize and document full query param preservation contract across auth -> OAuth -> grants.

## Pages and Responsibilities (Supporting Detail)

### `/` (Auth page, backed by `_auth` module)

Purpose:

- Render the auth experience on the root route (`/`) using Privy (email, Google, Apple).
- Bootstrap embedded wallet + signing flow.
- Post auth payload to backend via `/auth-callback`.
- Decide what success means based on arrival context.

Current implementation notes:

- Route: auth page is the root page (`/`).
- Module location: auth UI components live in `src/app/_auth/components/`.
- Flow/control logic lives in `src/app/_auth/auth.ts`.
- Default behavior today: on success, redirect to `/grants` after delay.

### `/grants`

Purpose:

- Explain "you need DataConnect to proceed".
- Let user launch installed app via deep link.
- Offer fallback download link for app install.

Current implementation notes:

- UI is in `src/app/grants/page.tsx`.
- Launch URL precedence and deep-link behavior are documented in `src/app/grants/README.md`.
- This is currently a launch-oriented stub while relay-backed grants flow is evolving.

## Implementation Direction (Next Step)

1. Freeze mode contract (`continue_to_grants` vs `return_to_app`) and keep existing behavior.
2. Decide query param preservation contract (minimal vs launch-complete).
3. Implement pass-through rules consistently in auth redirect and grants URL builder.
4. Add contract tests for param preservation (auth init, OAuth callback, grants fallback link).
5. Share contract with external repo owners before cross-repo implementation.

## Non-goals (for now)

- Full grants consent UI and legal consent copy activation.
- Replacing grants launch stub with complete relay-backed permissions UI.
- Redesigning auth providers or wallet bootstrap internals.
