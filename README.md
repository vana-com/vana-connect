# @opendatalabs/connect

SDK for integrating Vana Data Portability "Connect data" flows into builder applications.

## Installation

```bash
npm install @opendatalabs/connect
```

## Entrypoints

| Entrypoint                     | Environment | Description                                |
| ------------------------------ | ----------- | ------------------------------------------ |
| `@opendatalabs/connect/server` | Node.js     | Session relay, request signer, data client |
| `@opendatalabs/connect/react`  | Browser     | Polling hook, connect button               |
| `@opendatalabs/connect/core`   | Universal   | Shared types and errors                    |

## Quick Start (Server)

```typescript
import {
  createSessionRelay,
  createDataClient,
} from "@opendatalabs/connect/server";

// Create a session for your user
const relay = createSessionRelay({
  privateKey: process.env.VANA_APP_PRIVATE_KEY,
  granteeAddress: "0x...",
  sessionRelayUrl: "https://session-relay.vana.org",
});
const session = await relay.initSession({
  scopes: ["instagram.profile"],
});

// Poll until user approves in Desktop App
const result = await relay.pollUntilComplete(session.sessionId);

// Fetch user data with the grant
const data = createDataClient({
  privateKey: process.env.VANA_APP_PRIVATE_KEY,
  gatewayUrl: "https://gateway.vana.org",
});
const serverUrl = await data.resolveServerUrl(result.grant.userAddress);
const profile = await data.fetchData({
  serverUrl,
  scope: "instagram.profile",
  grantId: result.grant.grantId,
});
```

## Quick Start (React)

```tsx
import { useVanaConnect } from "@opendatalabs/connect/react";

function ConnectPage({ sessionId }: { sessionId: string }) {
  const { connect, status, grant, deepLinkUrl } = useVanaConnect({
    sessionRelayUrl: "https://session-relay.vana.org",
  });

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

## License

MIT
