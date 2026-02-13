# Vana Connect SDK

Let your users customize your app with their own data. 

Users connect platforms they already use — ChatGPT, Instagram, Gmail, and more — through the [Vana Desktop App](https://www.vana.com/download), which keeps them in control of what's shared. Your app receives structured, user-consented data through a cryptographically verified grant. No scraping, no OAuth token juggling, no compliance gray areas.

## How it works

```
Your App                         Vana Protocol
──────────────────────────────   ──────────────────────────────

1. connect({ scopes })
   → creates session
   → returns deep link      ──▶  2. User opens Desktop App
                                     reviews scopes, exports data,
                                     approves grant

3. Poll resolves with grant  ◀──  Grant signed & registered

4. getData({ grant })        ──▶  5. Personal Server returns
   → structured JSON                 user data over TLS
```

The SDK handles session creation, cryptographic request signing, polling, and data fetching. You write three function calls; the protocol handles the rest.

## Where this fits in the Vana protocol

The [Data Portability Protocol](https://docs.vana.org) defines how users collect data from platforms, store it under their control (on-device or hosted), and grant third-party apps scoped access. The protocol participants are:

- **Personal Server** — stores and serves user data, enforces grants
- **Data Portability Gateway** — fast API with eventual on-chain consistency
- **Vana L1** — on-chain source of truth for grants, builder registry, and file records

**This SDK is the builder integration layer.** It sits between your app and the protocol, abstracting the Session Relay handshake, Web3Signed authentication, and Personal Server data fetching into a clean API.

## Installation

```bash
npm install @opendatalabs/connect
```

## Prerequisites

Register as a builder through the Vana Desktop App first.


## Quickstart

### 1. Create a session (server)

```typescript
import { connect } from "@opendatalabs/connect/server";

const session = await connect({
  privateKey: process.env.VANA_APP_PRIVATE_KEY as `0x${string}`,
  scopes: ["chatgpt.conversations"],
  webhookUrl: "https://yourapp.com/api/webhook",  // optional
  appUserId: "user-42",                            // optional
});

// Return to your frontend:
// session.sessionId   — used for polling
// session.deepLinkUrl — opens the Vana Desktop App
// session.expiresAt   — ISO 8601 expiration
```

### 2. Poll for user approval (client)

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
/>
```

### 3. Fetch user data (server)

```typescript
import { getData } from "@opendatalabs/connect/server";

const data = await getData({
  privateKey: process.env.VANA_APP_PRIVATE_KEY as `0x${string}`,
  grant, // GrantPayload from step 2
});

// Map<string, unknown> keyed by scope
const conversations = data.get("chatgpt.conversations");
```

### Web App Manifest

The Desktop App verifies your identity by fetching your manifest. Use `signVanaManifest()` to generate it:

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

## API Reference

### Entrypoints

| Import                          | Environment | Exports                                                          |
| ------------------------------- | ----------- | ---------------------------------------------------------------- |
| `@opendatalabs/connect/server`  | Node.js     | `connect()`, `getData()`, `signVanaManifest()`, low-level clients |
| `@opendatalabs/connect/react`   | Browser     | `useVanaConnect()`, `ConnectButton`                               |
| `@opendatalabs/connect/core`    | Universal   | Types, `ConnectError`, constants                                  |

### `connect(config): Promise<SessionInitResult>`

Creates a session on the Session Relay. Returns `sessionId`, `deepLinkUrl`, and `expiresAt`.

| Param        | Type           | Required | Description                         |
| ------------ | -------------- | -------- | ----------------------------------- |
| `privateKey` | `` `0x${string}` `` | Yes      | Builder private key                 |
| `scopes`     | `string[]`     | Yes      | Data scopes to request              |
| `webhookUrl` | `string`       | No       | URL for grant event notifications   |
| `appUserId`  | `string`       | No       | Your app's user ID for correlation  |

### `getData(config): Promise<Map<string, unknown>>`

Fetches user data from their Personal Server using a signed grant.

| Param        | Type           | Required | Description                     |
| ------------ | -------------- | -------- | ------------------------------- |
| `privateKey` | `` `0x${string}` `` | Yes      | Builder private key             |
| `grant`      | `GrantPayload` | Yes      | Grant from the approval step    |

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
  grantId: string;        // on-chain permission ID
  userAddress: string;    // user's wallet address
  builderAddress: string; // your registered address
  scopes: string[];       // approved data scopes
  serverAddress?: string; // user's Personal Server
  appUserId?: string;     // your app's user ID (if provided)
}
```

### Low-level clients

For full control over individual protocol interactions:

```typescript
import {
  createRequestSigner,  // Web3Signed header generation
  createSessionRelay,   // Session Relay HTTP client
  createDataClient,     // Data Gateway HTTP client
} from "@opendatalabs/connect/server";
```

## Examples

See [`examples/nextjs-starter`](./examples/nextjs-starter) for a complete working integration with Next.js, including manifest signing, webhook handling, and the full connect-to-data-fetch flow.

## License

MIT
