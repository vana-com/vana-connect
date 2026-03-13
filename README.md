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

The fastest way to get up and running is with the `examples/nextjs-starter` — a complete working app which uses the development environment and has full flow of data portability wired up:

```bash
git clone https://github.com/vana-com/vana-connect.git
cd vana-connect/examples/nextjs-starter
cp .env.local.example .env.local
```

Use the pre-registered dev key in .env.local. Note that this private key is ONLY for testing and works only with a testing Vana environment.

```
VANA_PRIVATE_KEY=0x3c05ac1a00546bc0b1b8d3a11fb908409005fac3f26d25f70711e4f632e720d3
APP_URL=http://localhost:3001
```

Install and run

```
pnpm install
pnpm dev
```

Note that while testing this example app, you should have a development version of the [DataConnect app](https://github.com/vana-com/data-connect?tab=readme-ov-file#development).

There is one caveat in development: the deep-link for DataConnect app doesn't open the dev version of the app.
This means that when testing your app from the end user perspective, once you see this screen:
<img width="627" height="560" alt="Screenshot 2026-02-21 at 15 02 58" src="https://github.com/user-attachments/assets/477ae78f-d84d-4178-a1e9-48abedf36946" />

Instead of clicking the "Launch DataConnect" button, you should right-click on it and copy its address. The address will be something like `vana://connect?sessionId=...`.

Then, in your dev version of DataConnect (likely built from the `main` branch) you will see a place to copy the link in the right-bottom corner of the app:

<img width="348" height="258" alt="Screenshot 2026-02-21 at 15 09 18" src="https://github.com/user-attachments/assets/9f9d7a14-c92e-4185-bdc2-a2d93282c748" />

---

## Manual integration

If you prefer to integrate the SDK into an existing project, follow the steps below.

## Headless CLI

`vana-connect` now also ships a local collection CLI for connector setup and data export flows.

### Install

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/main/install/install.sh | sh
```

Windows PowerShell:

```powershell
iwr https://raw.githubusercontent.com/vana-com/vana-connect/main/install/install.ps1 -useb | iex
```

Both installers fetch the latest GitHub release asset for your platform, verify its checksum, and install `vana` without requiring Node or npm.

If you want the npm package path as a fallback:

```bash
npx -y @opendatalabs/connect status
```

### Commands

```bash
vana sources
vana connect github
vana status
vana setup
```

### Local development

From this repo:

```bash
pnpm install
pnpm build
node dist/cli/bin.js status
```

The CLI installs its local browser runtime under `~/.dataconnect/`.
That runtime is bundled from `vana-connect` itself, so `vana setup` does not require a separate `data-connect` checkout.

To build a standalone SEA executable locally:

```bash
pnpm build
pnpm build:sea
./artifacts/sea/vana-linux-x64 status --json
```

`pnpm build:sea` uses Node 25's `--build-sea` flow and embeds the runtime assets needed for `vana setup`.
It produces a platform-specific executable directory plus a release archive and matching checksum file under `artifacts/sea/`.

### Programmatic runtime access

If you are building an app surface like DataConnect Desktop or a hosted orchestration layer, use the SDK modules instead of shelling out to the CLI where possible.

```ts
import { ManagedPlaywrightRuntime } from "@opendatalabs/connect/runtime";
import { listAvailableSources } from "@opendatalabs/connect/connectors";
```

Intended split:

- app surfaces consume SDK/runtime APIs
- agent skills consume the CLI
- `data-connectors` remains the connector and schema source of truth

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
  appUserId: "yourapp-user-42", // optional: correlate your app user with the data they provided
});

// Return to your frontend:
// session.sessionId  — used for polling
// session.connectUrl — opens the Vana account page → launches DataConnect
// session.expiresAt  — ISO 8601 expiration
```

#### 2. Poll for user approval (client)

```tsx
import { useVanaConnect } from "@opendatalabs/connect/react";

function ConnectData({ sessionId }: { sessionId: string }) {
  const { connect, status, grant, connectUrl } = useVanaConnect();

  useEffect(() => {
    connect({ sessionId });
  }, [sessionId]);

  if (status === "waiting" && connectUrl) {
    return <a href={connectUrl}>Connect your data</a>;
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

## API Reference

### Entrypoints

| Import                         | Environment | Exports                                                           |
| ------------------------------ | ----------- | ----------------------------------------------------------------- |
| `@opendatalabs/connect/server` | Node.js     | `connect()`, `getData()`, `signVanaManifest()`, low-level clients |
| `@opendatalabs/connect/react`  | Browser     | `useVanaConnect()`, `useVanaData()`, `ConnectButton`              |
| `@opendatalabs/connect/core`   | Universal   | Types, `ConnectError`, constants                                  |

### `connect(config): Promise<SessionInitResult>`

Creates a session on the Session Relay. Returns `sessionId`, `connectUrl`, and `expiresAt`.

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
const { connect, status, grant, error, connectUrl, reset } = useVanaConnect();
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
