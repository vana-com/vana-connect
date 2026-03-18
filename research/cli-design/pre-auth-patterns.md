# CLI Browser Auth & Pre-Auth Verification Patterns

_As of March 16, 2026_

## How Production CLIs Handle Browser Auth

| CLI                | Flow                       | Browser Open                 | Polling                   | Headless Fallback                       |
| ------------------ | -------------------------- | ---------------------------- | ------------------------- | --------------------------------------- |
| **gh auth login**  | OAuth Device Code          | Auto + clipboard code        | Every 5s                  | `--with-token` / `GH_TOKEN` env         |
| **stripe login**   | Device Code variant        | Enter to open                | Every 1s, 60s timeout     | `--api-key` / `STRIPE_API_KEY` env      |
| **vercel login**   | Device Code                | Auto                         | Server-specified interval | `--token` on other commands             |
| **firebase login** | OAuth + localhost redirect | Auto                         | Waits for callback        | `login:ci` for CI tokens                |
| **railway login**  | Pairing code               | Auto                         | Browser verification      | `--browserless` + `RAILWAY_TOKEN` env   |
| **az login**       | Authorization code         | Auto (fallback: device code) | Interval-based            | `--use-device-code` / service principal |
| **netlify login**  | Device Code                | Auto                         | HTTP polling              | Token in config                         |

### Universal Patterns

1. **Auto-open browser** with fallback to printing URL
2. **Short-lived verification codes** displayed in terminal (MITM protection)
3. **Polling with timeout** (not callbacks) for completion detection
4. **Clear progress messages**: "Waiting for confirmation..." with spinner
5. **Token storage** in `~/.config/<tool>/` with restricted file permissions

## Pre-Auth Verification

### How CLIs Check Existing Auth

- **File existence**: Does `~/.config/gh/hosts.yml` exist?
- **Token format**: Parse stored token, check expiry claim
- **Lazy validation**: Trust stored token until it actually fails on an API call

Key insight: **CLIs avoid throwaway API calls to verify auth.** They trust the stored token structure and only validate on actual use. `gh auth status` is the exception -- it actively calls GitHub's API.

### Pre-existing Auth Check (Netlify pattern)

```
$ netlify login
You are already logged in via netlify config
Run netlify status for account details
To login with a new account, run netlify login --new
```

Netlify checks `getToken()` before attempting login. Skips the browser flow entirely if already authenticated.

## Vana's Case Is Different

The CLIs above authenticate **to their own service** via OAuth flows they control. Vana connectors authenticate **to third-party services** (GitHub, ChatGPT, Google) where Vana has no OAuth integration. This means:

- No device code flow (Vana doesn't control the auth server)
- No token exchange (Vana doesn't get API tokens)
- Auth state lives in a **browser profile** (cookies/sessions), not a token file
- Session validity can only be checked by **visiting the site and inspecting the DOM**

## Recommended Patterns for Vana

### Pre-flight Session Check

Use `connectURL` + `connectSelector` metadata per connector:

```json
{
  "name": "GitHub",
  "connectURL": "https://github.com",
  "connectSelector": "header [aria-label*='profile']"
}
```

Before running the full connector:

```
1. Launch headless browser with saved profile
2. Navigate to connectURL
3. Check if connectSelector is visible (2-5 second timeout)
4. Visible -> "Session active, proceeding..."
5. Not visible -> "You need to log into GitHub first"
```

This is analogous to `gh auth status` but using DOM inspection instead of API calls.

### Guided Login Flow (when pre-flight fails)

```
$ vana connect github

  Checking authentication...
  Not logged in to GitHub.
  Open browser to log in? (y/n): y
  Browser opened. Waiting for login...
  Login detected. Starting data collection...
```

Pattern: open `connectURL` in headed browser, poll `connectSelector` every 2-3s, close when detected. Adapts the Stripe/Railway "open browser + poll" pattern for third-party sites.

### Headless Fallback

```
$ vana connect github --no-browser
Not logged in to GitHub.
Please log in at: https://github.com/login
Then re-run this command.
```

Always support non-interactive mode. Print the URL, exit with clear instructions.

### Session State Tracking

Upgrade from boolean `sessionPresent` (directory exists) to `sessionState: "valid" | "expired" | "unknown" | "none"` to capture pre-flight check results.

## Key Takeaways

1. Pre-flight auth checks should be fast (2-5s timeout) and non-interactive
2. Offer browser-based login when pre-flight fails, with a `--no-browser` escape hatch
3. `connectURL` + `connectSelector` per connector enables all of the above
4. Track session validity state, not just session existence
