# Connect Web Flow Architecture (Auth + Grants)

This document defines the mental model and technical contract between:

- `/` auth experience (Vana Passport sign-in)
- `/grants` launch/download experience for Data Connect

It exists to answer: _what page should happen next after auth success_, based on **arrival context**.

This doc is architecture: flow semantics, routing contracts, and page responsibilities.

## Mental Model (User-facing)

There are two user journeys entering auth:

1. **Web-first journey**  
   User starts in web context and needs to continue into data permissions.
   - Auth success should continue to `/grants` (or future permissions route).

2. **Desktop-handoff journey**  
   User arrived at auth from an installed Data Connect app handoff (OS-level app flow).
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

## Success Behavior Matrix

| Arrival context | Auth success copy                                 | Auth success action                       |
| --------------- | ------------------------------------------------- | ----------------------------------------- |
| Web-first       | "Redirecting you to your data permissions..."     | Redirect to `/grants` after delay         |
| Desktop-handoff | "Return to Data Connect. You may close this tab." | Stay on auth success screen (no redirect) |

## Current vs Target

Current:

- One success path in auth: always redirect to `grantsUrl`.

Target:

- Success path is conditional on arrival context.
- UI copy and action are both context-aware.

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

- Explain "you need Data Connect to proceed".
- Let user launch installed app via deep link.
- Offer fallback download link for app install.

Current implementation notes:

- UI is in `src/app/grants/page.tsx`.
- Launch URL precedence and deep-link behavior are documented in `src/app/grants/README.md`.
- This is currently a launch-oriented stub while relay-backed grants flow is evolving.

## Implementation Direction (Next Step)

1. Introduce an explicit arrival-context query param contract.
2. Parse it in `useAuthPage()` during init.
3. Preserve it through OAuth redirect generation.
4. Branch success transition:
   - web mode -> existing redirect to `grantsUrl`
   - app mode -> no redirect; remain on success message
5. Update success UI in `auth-form.tsx` to render copy by mode.

## Non-goals (for now)

- Full grants consent UI and legal consent copy activation.
- Replacing grants launch stub with complete relay-backed permissions UI.
- Redesigning auth providers or wallet bootstrap internals.
