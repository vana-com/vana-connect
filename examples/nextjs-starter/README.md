# Next.js Starter

Minimal Next.js app demonstrating the Vana Connect flow. Shows the server-side SDK (`connect()` + `getData()`) and client-side polling via `useVanaConnect()`.

## Prerequisites

- A builder address registered on-chain via the Vana Gateway
- A running Personal Server with `VANA_MASTER_KEY_SIGNATURE` set

## Setup

```bash
cp .env.local.example .env.local
# Edit .env.local with your private key and scopes
pnpm install
pnpm dev   # Opens on http://localhost:3001
```

## E2E Testing Workflow

1. **Terminal 1** — Start your Personal Server (`pnpm dev`)
2. **Terminal 2** — Start this app (`pnpm dev`)
3. **Browser Tab 1** — Open `http://localhost:3001`, click "Connect Your Data"
4. **Browser Tab 2** — Open the Personal Server Dev UI → Connect tab
5. Paste the deep link URL from Tab 1 into Tab 2
6. Click "Auto-Approve All" (or step through manually)
7. Tab 1 updates from "Waiting..." to "Approved!" with grant details
