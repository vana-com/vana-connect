# Vana Connect SDK

Let your users bring their own data to your app.

## What problem this solves

Your users already have rich personal data — ChatGPT conversations, Instagram activity, Gmail, purchase history — but it's locked inside the platforms that collected it. As a builder, you can't easily use that data to personalize onboarding, tailor recommendations, or skip lengthy signup forms.

**Data portability** means users can export their data from these platforms and grant your app scoped access to it — with their explicit consent, cryptographic verification, and full control over what's shared and when to revoke it.

Today, getting access to user data means asking for manual file uploads (high friction), scraping on their behalf (fragile and legally risky), or negotiating enterprise API deals (slow and expensive). This SDK gives you a standardized way to request and receive personal data through Vana's [Data Portability Protocol](https://docs.vana.org/), handling session creation, grant verification, and data fetching in three function calls.

## How it works

```
Your App                         Vana Protocol
──────────────────────────────   ──────────────────────────────

1. connect({ scopes })
   → creates session
   → returns deep link      ──▶  2. User opens DataConnect
                                    reviews scopes, exports data,
                                    approves grant

3. Poll resolves with grant  ◀──  Grant signed & registered

4. getData({ grant })        ──▶  5. Personal Server returns
   → structured JSON                 user data over TLS
```

The [Data Portability Protocol](https://docs.vana.org/) defines how users collect data from platforms, store it under their control (on-device or hosted), and grant third-party apps scoped access. This SDK handles session creation, cryptographic request signing, polling, and data fetching. You write three function calls; the protocol handles the rest.

## Getting started

The fastest way to get up and running is with the **Next.js starter** — a complete working app with session creation, polling, data fetching, manifest signing, and webhook handling already wired up:

```bash
git clone https://github.com/vana-com/vana-connect.git
cd vana-connect/examples/nextjs-starter
cp .env.local.example .env.local
# Edit .env.local with your private key and APP_URL
pnpm install
pnpm dev
```

For local development, use the pre-registered dev key in .env.local

```
VANA_PRIVATE_KEY=0x3c05ac1a00546bc0b1b8d3a11fb908409005fac3f26d25f70711e4f632e720d3
APP_URL=http://localhost:3001
```

See [`examples/nextjs-starter`](./examples/nextjs-starter) for full details.

---

## Manual integration

If you prefer to integrate the SDK into an existing project, follow the steps below.

### Installation

```bash
pnpm add @opendatalabs/connect
```

### Package manager

This repo is pnpm-only for local development and examples. Use `pnpm` commands, not `npm`.

### Prerequisites

First, register your app in the [Developer Portal](https://vana-developers.replit.app/). You will need to provide the URL where your app will be deployed, and then be given a private key after registration.

### Quickstart

#### 1. Create a session (server)

```typescript
import { connect } from "@opendatalabs/connect/server";

const session = await connect({
  privateKey: process.env.VANA_APP_PRIVATE_KEY as `0x${string}`,
  scopes: ["chatgpt.conversations"],
  webhookUrl: "https://yourapp.com/api/webhook", // optional, data can be pushed to a web hook after a grant is approved
  appUserId: "yourapp-user-42", // optional: this is used to corelate your app user with the data they provided
});

// Return to your frontend:
// session.sessionId   — used for polling
// session.deepLinkUrl — opens the DataConnect App
// session.expiresAt   — ISO 8601 expiration
```

#### 2. Poll for user approval (client)

```tsx
import { useVanaConnect } from "@opendatalabs/connect/react";

function ConnectData({ sessionId }: { sessionId: string }) {
  const { connect, status, grant, deepLinkUrl } = useVanaConnect();

  useEffect(() => {
    connect({ sessionId });
  }, [sessionId]);

  if (status === "waiting" && deepLinkUrl) {
    return <a href={deepLinkUrl}>Connect your data</a>;
  }
  if (status === "approved" && grant) {
    // grant.grantId, grant.userAddress, grant.scopes are available
    return <p>Connected.</p>;
  }
  return <p>{status}</p>;
}
```

Or use the pre-built button:

```tsx
import { ConnectButton } from "@opendatalabs/connect/react";

<ConnectButton
  sessionId={sessionId}
  onComplete={(grant) => saveGrant(grant)}
  onError={(err) => console.error(err)}
/>;
```

#### 3. Fetch user data (server)

```typescript
import { getData } from "@opendatalabs/connect/server";

const data = await getData({
  privateKey: process.env.VANA_APP_PRIVATE_KEY as `0x${string}`,
  grant, // GrantPayload from step 2
});

// Record<string, unknown> keyed by scope
const conversations = data["chatgpt.conversations"];
```

#### Web App Manifest

The DataConnect App verifies your identity by fetching your manifest. Use `signVanaManifest()` to generate it:

```typescript
import { signVanaManifest } from "@opendatalabs/connect/server";

// In your manifest route handler (e.g. Next.js /manifest.json/route.ts):
const vanaBlock = await signVanaManifest({
  privateKey: process.env.VANA_APP_PRIVATE_KEY as `0x${string}`,
  appUrl: "https://yourapp.com",
  privacyPolicyUrl: "https://yourapp.com/privacy",
  termsUrl: "https://yourapp.com/terms",
  supportUrl: "https://yourapp.com/support",
  webhookUrl: "https://yourapp.com/api/webhook",
});

const manifest = {
  name: "Your App",
  short_name: "YourApp",
  start_url: "/",
  display: "standalone",
  vana: vanaBlock, // signed identity block
};
```

Make sure your HTML includes `<link rel="manifest" href="/manifest.json">`.

## Connectors

Available data connectors and their scopes (schema definitions):
[`vana-com/data-connectors/schemas`](https://github.com/vana-com/data-connectors/tree/main/schemas)

| Platform  | Scopes                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| ChatGPT   | `chatgpt.conversations`, `chatgpt.memories`                                        |
| Instagram | `instagram.profile`, `instagram.posts`, `instagram.liked_posts`                    |
| LinkedIn  | `linkedin.profile`, `linkedin.experience`, `linkedin.education`, `linkedin.skills` |
| Spotify   | `spotify.savedTracks`, `spotify.playlists`                                         |

## API Reference

### Entrypoints

| Import                         | Environment | Exports                                                           |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `@opendatalabs/connect/server` | Node.js     | `connect()`, `getData()`, `signVanaManifest()`, low-level clients |
| `@opendatalabs/connect/react`  | Browser     | `useVanaConnect()`, `useVanaData()`, `ConnectButton`              |
| `@opendatalabs/connect/core`   | Universal   | Types, `ConnectError`, constants                                  |

### `connect(config): Promise<SessionInitResult>`

Creates a session on the Session Relay. Returns `sessionId`, `deepLinkUrl`, and `expiresAt`.

| Param        | Type                | Required | Description                                                            |
| ------------ | ------------------- | -------- | ---------------------------------------------------------------------- |
| `privateKey` | `` `0x${string}` `` | Yes      | Builder private key                                                    |
| `scopes`     | `string[]`          | Yes      | Data scopes to request                                                 |
| `webhookUrl` | `string`            | No       | Public HTTPS URL for grant event notifications (localhost is rejected) |
| `appUserId`  | `string`            | No       | Your app's user ID for correlation                                     |

### `getData(config): Promise<Record<string, unknown>>`

Fetches user data from their Personal Server using a signed grant.

| Param        | Type                | Required | Description                  |
| ------------ | ------------------- | -------- | ---------------------------- |
| `privateKey` | `` `0x${string}` `` | Yes      | Builder private key          |
| `grant`      | `GrantPayload`      | Yes      | Grant from the approval step |

### `useVanaConnect(config?): UseVanaConnectResult`

React hook that polls the Session Relay and manages connection state.

```typescript
const { connect, status, grant, error, deepLinkUrl, reset } = useVanaConnect();
```

`status` transitions: `idle` &rarr; `connecting` &rarr; `waiting` &rarr; `approved` | `denied` | `expired` | `error`

### `GrantPayload`

Returned when a user approves access:

```typescript
interface GrantPayload {
  grantId: string; // on-chain permission ID
  userAddress: string; // user's wallet address
  builderAddress: string; // your registered address
  scopes: string[]; // approved data scopes
  serverAddress?: string; // user's Personal Server
  appUserId?: string; // your app's user ID (if provided)
}
```

### Low-level clients

For full control over individual protocol interactions:

```typescript
import {
  createRequestSigner, // Web3Signed header generation
  createSessionRelay, // Session Relay HTTP client
  createDataClient, // Data Gateway HTTP client
} from "@opendatalabs/connect/server";
```

## License

MIT
