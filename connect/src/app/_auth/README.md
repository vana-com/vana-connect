# `_auth` module

Auth window for Connect. This module does more than sign-in: it authenticates with Privy, provisions/uses an embedded wallet, signs required payloads, and returns auth results to the app.

## What we are trying to achieve

1. Let a user sign in with email OTP, Google, or Apple using Privy.
2. Ensure the user has an embedded wallet and can sign messages.
3. Send auth results back to the host flow (`/auth-callback`).
4. Bootstrap Vana personal server registration (best-effort).

## Why it is structured this way

- Privy core SDK in this project is used as a low-level browser SDK.
- Embedded wallet communication requires iframe setup + message forwarding.
- We support multiple response shape variants to avoid hard failures during SDK/runtime variations.
- Auth and post-auth registration currently live together for simplicity of a single auth window flow.

## Required runtime config

`auth.ts` expects this global at runtime:

- `window.__AUTH_CONFIG__.privyAppId`
- `window.__AUTH_CONFIG__.privyClientId`

If either is missing, the UI shows:

- `"Missing Privy app config."`
- `"Missing Privy client config."`

### Localhost quick check

In browser devtools console, set:

```js
window.__AUTH_CONFIG__ = {
  privyAppId: "your-privy-app-id",
  privyClientId: "your-privy-client-id",
};
window.location.reload();
```

### Proper app wiring (recommended)

Inject `window.__AUTH_CONFIG__` from your host app/bootstrap path before rendering the auth flow, sourced from your runtime env/config system.

Example shape only:

```ts
window.__AUTH_CONFIG__ = {
  privyAppId: runtimeConfig.privyAppId,
  privyClientId: runtimeConfig.privyClientId,
};
```

Current status in this repo: `_auth` consumes this global, but no dedicated injection module is wired yet.

## Files

- `auth.ts`
  - Main auth state machine/hook (`useAuthPage`)
  - Privy client init, email/OAuth login, wallet setup/signing, callback posting
- `components/auth-form.tsx`
  - UI for loading/login/success states
- `auth.types.ts`
  - Public/shared auth module types used across files
- `auth.internal.types.ts`
  - Internal adapter types for SDK/runtime payload shapes
- `auth-integration-concerns.md`
  - Known risks, gaps, and planned follow-ups

## Type boundary (important)

- Public module contract types go in `auth.types.ts`.
- Internal/adapter types stay in `auth.internal.types.ts`.
- We intentionally do not import deep SDK internal type paths.

## External references

- Privy core JS SDK flow: https://docs.privy.io/recipes/core-js

## Actionable next steps

- Decide manual close vs auto-close (`scheduleCloseTab`).
- Replace `localStorage.clear()` with scoped key cleanup.
- Add strict typed contracts/guards for backend endpoint responses.
- Add cleanup for iframe message listeners.
- Consider splitting auth success from post-auth registration phase.
