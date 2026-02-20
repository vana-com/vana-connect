# Grants Page

`/grants` is currently a UI-first integration stub for launching DataConnect while backend relay wiring is in progress.

## Launch URL Precedence

The launch button uses this order:

1. `deepLinkUrl` (or `deep_link_url`) query param from upstream flow
2. `NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL` from env (local smoke-test override)
3. Generated `vana://connect?...` fallback URL

Implementation lives in `launch-url.ts`.

## Test URL Usage

Use this only for app-launch smoke tests (button opens desktop app). It is not a full relay-backed grant flow.

Suggested value:

```bash
NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL="vana://connect?sessionId=dev-smoke&secret=dev-smoke&appId=discover-me"
```

Real grant flows should pass through Session Relay's `deepLinkUrl` unchanged.
