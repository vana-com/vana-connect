# @opendatalabs/connect

SDK for integrating Vana Data Portability "Connect data" flows into web applications.

## Architecture

```
src/
├── core/           # Universal (browser + Node.js)
│   ├── constants.ts    # Environment URLs, getEnvConfig()
│   ├── errors.ts       # ConnectError, ConnectErrorCode
│   ├── grants.ts       # isValidGrant() type guard
│   ├── types.ts        # All shared TypeScript interfaces
│   └── index.ts        # Re-exports
├── server/         # Node.js only (requires viem)
│   ├── connect.ts      # High-level connect() and getData()
│   ├── session-relay.ts # Session Relay HTTP client
│   ├── data-client.ts  # Data Gateway / Personal Server client
│   ├── request-signer.ts # Web3Signed auth header generation
│   ├── manifest-signer.ts # Web app manifest signing
│   ├── config.ts       # createVanaConfig() configuration helper
│   ├── webhook.ts      # verifyWebhook() stub
│   └── index.ts        # Re-exports
├── react/          # Browser only (requires react)
│   ├── useVanaConnect.ts # Polling hook
│   ├── useVanaData.ts    # Full-flow hook (init + poll + fetch)
│   ├── ConnectButton.tsx # Pre-built UI component
│   └── index.ts        # Re-exports
└── index.ts        # Re-exports core
```

### Entry points

| Import path                    | Environment | Key exports                                                                   |
| ------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| `@opendatalabs/connect/server` | Node.js     | `connect`, `getData`, `createVanaConfig`, `signVanaManifest`, `verifyWebhook` |
| `@opendatalabs/connect/react`  | Browser     | `useVanaConnect`, `useVanaData`, `ConnectButton`                              |
| `@opendatalabs/connect/core`   | Universal   | `ConnectError`, `ConnectErrorCode`, `isValidGrant`, types                     |
| `@opendatalabs/connect`        | Universal   | Re-exports core                                                               |

### Core flow

1. **Server**: `connect({ privateKey, scopes })` creates a session on the Session Relay
2. **Client**: `useVanaConnect().connect({ sessionId })` polls until user approves in the Vana Desktop App
3. **Server**: `getData({ privateKey, grant })` fetches user data from their Personal Server

## Build & test

```bash
pnpm build        # tsc --build
pnpm test         # vitest run
pnpm validate     # lint + format check + test
pnpm test:watch   # vitest in watch mode
```

## Conventions

- **ESM-only** — `"type": "module"` in package.json
- **Zero runtime dependencies** — viem and react are optional peer dependencies
- **Factory pattern** for low-level clients (`createSessionRelay`, `createDataClient`, `createRequestSigner`)
- **TSDoc** on all public exports with `@param`, `@returns`, `@throws`, `@example`
- **Error handling** via `ConnectError` with typed `ConnectErrorCode` constants
- **Test framework**: vitest with `vi.stubGlobal("fetch", mockFetch)` pattern for HTTP mocking
- **Commit messages**: conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

## Environment variables (for examples/nextjs-starter)

| Variable           | Required | Description                       |
| ------------------ | -------- | --------------------------------- |
| `VANA_PRIVATE_KEY` | Yes      | Builder private key (0x-prefixed) |
| `APP_URL`          | Yes      | Public URL of your deployed app   |
