# @opendatalabs/connect

SDK for integrating Vana Data Portability "Connect data" flows into builder applications.

## Installation

```bash
npm install @opendatalabs/connect
```

## Entrypoints

| Entrypoint                     | Environment | Description                                                       |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `@opendatalabs/connect/server` | Node.js     | `connect()`, `getData()`, `signVanaManifest()`, low-level clients |
| `@opendatalabs/connect/react`  | Browser     | Polling hook, connect button                                      |
| `@opendatalabs/connect/core`   | Universal   | Shared types, errors, and constants                               |

## Quick Start

### 1. Initialize a session (server)

```typescript
import { connect } from "@opendatalabs/connect/server";

const session = await connect({
  privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
  scopes: ["instagram.dpv1"],
});

// session.sessionId   — pass to the client for polling
// session.deepLinkUrl — surface to the user (QR code, deep link, etc.)
// session.expiresAt   — session expiration timestamp
```

### 2. Poll for approval (client)

```tsx
import { useVanaConnect } from "@opendatalabs/connect/react";

function ConnectPage({ sessionId }: { sessionId: string }) {
  const { connect, status, grant, deepLinkUrl } = useVanaConnect();

  useEffect(() => {
    connect({ sessionId });
  }, [sessionId]);

  if (status === "waiting" && deepLinkUrl) {
    return <a href={deepLinkUrl}>Open Vana Desktop App</a>;
  }

  if (status === "approved" && grant) {
    return <p>Connected! Grant: {grant.grantId}</p>;
  }

  return <p>Status: {status}</p>;
}
```

### 3. Fetch data (server)

```typescript
import { getData } from "@opendatalabs/connect/server";

const data = await getData({
  privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
  grant, // GrantPayload from the approval step
});

// data is a Map<string, unknown> keyed by scope
```

### Options

```typescript
// connect() options
await connect({
  privateKey: "0x...",
  scopes: ["instagram.dpv1"],
  webhookUrl: "https://...", // optional webhook for session events
  appUserId: "user-42", // optional app-level user ID
});
```

### 4. Sign a web app manifest (server)

```typescript
import { signVanaManifest } from "@opendatalabs/connect/server";

const vanaBlock = await signVanaManifest({
  privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
  appUrl: "https://your-app.example.com",
  privacyPolicyUrl: "https://your-app.example.com/privacy",
  termsUrl: "https://your-app.example.com/terms",
  supportUrl: "https://your-app.example.com/support",
  webhookUrl: "https://your-app.example.com/api/webhook",
});

// Include vanaBlock in your W3C Web App Manifest as the "vana" key
// The Desktop App fetches this manifest to verify builder identity
```

### Advanced (Low-Level APIs)

For full control, the low-level factories are still available:

```typescript
import {
  createSessionRelay,
  createDataClient,
  createRequestSigner,
} from "@opendatalabs/connect/server";
```

## License

MIT
