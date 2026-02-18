# Auth Migration Plan: Privy to account.vana.org

## Overview

Move authentication out of the Data Connect desktop app and into a web-based flow on **account.vana.org**. Users sign in on the web, then deep link into Data Connect in an already-authenticated state. When the desktop app needs signing capabilities, it calls back to `account.vana.org/api/sign`, which uses a **Privy Signer** (a single server-side authorization key) to sign on behalf of any user --- no JWT, no user interaction required.

---

## Current Flow vs. New Flow

### Current Flow

```
Builder App → SDK creates session → deep link vana://connect?sessionId=xxx
  → Data Connect opens
  → Starts local auth server on localhost:3083
  → Opens browser to localhost auth page (Privy Core JS SDK)
  → User logs in (Google/Apple/Email)
  → Privy creates embedded wallet
  → Signs "vana-master-key-v1" (personal_sign)
  → Signs ServerRegistration (EIP-712)
  → Posts auth result back to localhost
  → Browser closes, user returns to desktop app
```

### New Flow

```
Builder App → SDK creates session → redirects to account.vana.org/connect?sessionId=xxx
  → User signs in with Privy (React SDK)
  → Signer added to wallet (one-time, user approves modal)
  → Signs "vana-master-key-v1" in browser (useSignMessage)
  → Deep links to vana://connect?sessionId=xxx&secret=xxx&masterKeySig=xxx
  → Data Connect derives walletAddress via ecrecover("vana-master-key-v1", masterKeySig)
  → Data Connect opens, already authenticated
  → When signing needed → POST account.vana.org/api/sign (signer, no JWT needed)
```

---

## Privy Concepts Used

### 1. Privy React SDK (`@privy-io/react-auth`)

Used on account.vana.org for browser-side authentication and wallet interactions.

**Setup** (from [Privy docs: React Setup](https://docs.privy.io/basics/react/setup)):

```tsx
"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="your-privy-app-id"
      clientId="your-app-client-id"
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

The `createOnLogin: 'users-without-wallets'` config ensures every user gets an embedded wallet automatically.

### 2. Signers (Authorization Keys)

A **signer** is a P-256 keypair that, once added to a user's wallet, can sign on behalf of that user from the server without needing the user's JWT. This is the core mechanism that makes the new flow work.

**Key properties:**

- One authorization key can be added as a signer to every user's wallet
- After the user approves (one-time modal), the server can sign indefinitely
- No user JWT needed --- the signer private key alone authorizes the request
- Works even when the user is offline

**Creating an authorization key** (from [Privy docs: Authorization Keys](https://docs.privy.io/controls/authorization-keys/keys/create/key)):

> Visit the **Authorization keys** page of the **Wallets** section for your app.
> Click the **New key** button and copy and save the generated **Private key**.
> Privy does not save this key and cannot help you recover it later.

Or programmatically:

```typescript
import { generateP256KeyPair } from "@privy-io/node";
const { privateKey, publicKey } = await generateP256KeyPair();
```

**Registering as a key quorum** (from [Privy docs: Signers Quickstart](https://docs.privy.io/wallets/using-wallets/signers/quickstart)):

> Visit the **Authorization keys** page of the Privy Dashboard and click **New key**.
> Then click **Register key quorum instead**.
> Enter the public key in the **Public keys** field.
> Set **Authorization threshold** to **1**.
> Save the **id** of the key quorum. You will need this value later.

This creates a 1-of-1 key quorum that can sign on behalf of any user's wallet it's added to.

### 3. Adding Signers to User Wallets

After login, add the signer to the user's embedded wallet (from [Privy docs: Add Signers](https://docs.privy.io/wallets/using-wallets/signers/add-signers)):

```typescript
import { useSigners } from "@privy-io/react-auth";
import { useLogin } from "@privy-io/react-auth";

const { addSigners } = useSigners();
const { login } = useLogin({
  onComplete: async (user, isNewUser) => {
    if (isNewUser) {
      await addSigners({
        address: user.wallet.address,
        signers: [
          {
            signerId: "insert-key-quorum-id-from-dashboard",
            policyIds: [], // empty = full signing permission
          },
        ],
      });
    }
  },
});
```

**UX impact:** The user sees a Privy confirmation modal once, during their first login. After that, the signer is permanently attached to their wallet.

### 4. Server-Side Signing with `@privy-io/node`

The server uses the signer's private key to sign messages without any user JWT (from [Privy docs: Signing on the Server](https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server)):

**Sign a message (personal_sign):**

```typescript
import { PrivyClient } from "@privy-io/node";

const privyClient = new PrivyClient({
  appId: "insert-your-app-id",
  appSecret: "insert-your-app-secret",
});

const { signature, encoding } = await privyClient
  .wallets()
  .ethereum()
  .signMessage("insert-user-wallet-id", {
    message: "Hello world",
    authorization_context: {
      authorization_private_keys: ["insert-signer-private-key"],
    },
  });
```

**Sign typed data (EIP-712):**

The `@privy-io/node` SDK also supports `signTypedData` for EIP-712 signatures via the same `wallets().ethereum()` interface. The `authorization_context` with `authorization_private_keys` works identically --- the signer private key authorizes the request.

> Privy docs reference for server-side typed data signing: https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data

### 5. Verifying Access Tokens

For the `/connect` page to know who the user is, we verify the Privy access token server-side (from [Privy docs: Access Tokens](https://docs.privy.io/authentication/user-authentication/access-tokens)):

```typescript
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: "your-privy-app-id",
  appSecret: "your-privy-app-secret",
});

try {
  const verifiedClaims = await privy.utils().auth().verifyAccessToken({
    access_token: accessToken,
  });
  // verifiedClaims.userId → Privy DID
  // verifiedClaims.appId, .sessionId, .expiration, etc.
} catch (error) {
  // Token invalid or expired
}
```

---

## Part 1: Vana Connect SDK Changes

### 1.1 Add `accountUrl` to environment config

**File:** `src/core/constants.ts`

Current:

```typescript
export const ENV_CONFIG = {
  dev: {
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
  },
  prod: {
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
  },
} as const;
```

Change to:

```typescript
export const ENV_CONFIG = {
  dev: {
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
    accountUrl: "https://account-dev.vana.org",
  },
  prod: {
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
    accountUrl: "https://account.vana.org",
  },
} as const;
```

### 1.2 Update `SessionInitResult` type

**File:** `src/core/types.ts`

Add `connectUrl` field, deprecate `deepLinkUrl`:

```typescript
export interface SessionInitResult {
  sessionId: string;
  /** URL to account.vana.org where the user signs in and launches Data Connect. */
  connectUrl: string;
  /** @deprecated Use `connectUrl` instead. Direct vana:// deep link. */
  deepLinkUrl: string;
  expiresAt: string;
}
```

### 1.3 Update `connect()` to return `connectUrl`

**File:** `src/server/connect.ts`

After getting the session from the relay, construct `connectUrl`:

```typescript
export async function connect(
  config: ConnectConfig,
): Promise<SessionInitResult> {
  const { sessionRelayUrl, accountUrl } = getEnvConfig(config.environment);
  const signer = createRequestSigner({ privateKey: config.privateKey });
  const granteeAddress = signer.address;

  const relay = createSessionRelay({
    privateKey: config.privateKey,
    granteeAddress,
    sessionRelayUrl,
  });

  const result = await relay.initSession({
    scopes: config.scopes,
    webhookUrl: config.webhookUrl,
    appUserId: config.appUserId,
  });

  // Build the account.vana.org connect URL
  const connectUrl = new URL("/connect", accountUrl);
  connectUrl.searchParams.set("sessionId", result.sessionId);
  // Pass through the secret from the deep link URL if present
  const deepLinkParams = new URL(result.deepLinkUrl);
  const secret = deepLinkParams.searchParams.get("secret");
  if (secret) connectUrl.searchParams.set("secret", secret);

  return {
    ...result,
    connectUrl: connectUrl.toString(),
  };
}
```

### 1.4 Update `useVanaConnect` hook

**File:** `src/react/useVanaConnect.ts`

- Add `connectUrl` to the return type and internal state (alongside `deepLinkUrl` as deprecated alias)
- `connect()` params accept `{ sessionId, connectUrl?, deepLinkUrl? }` (both, for backward compat)
- Fallback URL generation changes from `vana://connect?sessionId=...` to `${accountUrl}/connect?sessionId=...`
- Get `accountUrl` from `getEnvConfig(config?.environment)`

The fallback URL generation changes from:

```typescript
params.deepLinkUrl ?? `vana://connect?sessionId=${params.sessionId}`;
```

to:

```typescript
params.connectUrl ??
  params.deepLinkUrl ??
  `${accountUrl}/connect?sessionId=${params.sessionId}`;
```

### 1.5 Update `useVanaData` hook

**File:** `src/react/useVanaData.ts`

**Naming collision:** `UseVanaDataConfig.connectUrl` already means "local API route URL" (default `"/api/connect"`). Do NOT repurpose this field. Instead, update `initConnect` to read the new `connectUrl` from the API response:

```typescript
// In initConnect, read connectUrl from the API response
connect({
  sessionId: json.sessionId as string,
  connectUrl: (json.connectUrl ?? json.deepLinkUrl) as string,
});
```

Add `connectUrl: string | null` to `UseVanaDataResult`, sourced from `useVanaConnect`'s new `connectUrl` return value. Mark `deepLinkUrl` as deprecated.

### 1.6 Update `ConnectButton`

**File:** `src/react/ConnectButton.tsx`

The anchor tag now opens an HTTPS URL (account.vana.org) instead of a `vana://` deep link. Since this is a web URL, it opens in the user's browser --- which is the intended behavior.

```tsx
export interface ConnectButtonProps {
  sessionId: string;
  /** URL to account.vana.org/connect. Replaces deepLinkUrl. */
  connectUrl?: string;
  /** @deprecated Use connectUrl. */
  deepLinkUrl?: string;
  onComplete?: (grant: GrantPayload) => void;
  onError?: (error: string) => void;
  onDenied?: (reason: string) => void;
  className?: string;
  label?: string;
}
```

The anchor now renders:

```tsx
{
  connectUrl && status === "waiting" && (
    <a href={connectUrl} target="_blank" rel="noopener noreferrer">
      {label ?? "Connect with Vana"}
    </a>
  );
}
```

---

## Part 2: account.vana.org (connect/ app) Changes

The existing `connect/` Next.js app becomes account.vana.org.

### 2.1 Install Privy React SDK (additive, keep existing `@privy-io/js-sdk-core`)

The existing `_auth/auth.ts` uses `@privy-io/js-sdk-core` imperatively for the `/` and `/grants` pages. Adding `@privy-io/react-auth` is additive --- it doesn't break the existing pages.

**Package changes:**

```
pnpm add @privy-io/react-auth @privy-io/node viem
```

Keep `@privy-io/js-sdk-core` --- it powers the existing `/` page. It can be removed later when those pages are migrated.

### 2.2 Create PrivyProvider via route-group isolation

The existing pages must not be wrapped in `PrivyProvider` (they use the Core JS SDK). Use a Next.js **route group** so only the new `/connect` route gets the React SDK provider.

**New file:** `connect/src/app/(connect)/layout.tsx`

```tsx
"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

The root layout (`connect/src/app/layout.tsx`) is **not modified**. Only pages under `(connect)/` get the `PrivyProvider`.

### 2.3 Add signer onboarding logic

Call `addSigners` on **every login** (not just new users), wrapped in try/catch. Privy will throw if the signer already exists, which is fine to ignore.

```typescript
import { useSigners } from "@privy-io/react-auth";
import { useLogin } from "@privy-io/react-auth";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID!;

const { addSigners } = useSigners();

const { login } = useLogin({
  onComplete: async (user) => {
    const walletAddress = user.wallet?.address;
    if (walletAddress) {
      try {
        await addSigners({
          address: walletAddress,
          signers: [{ signerId: KEY_QUORUM_ID, policyIds: [] }],
        });
      } catch (err) {
        // Expected to fail if signer already exists on this wallet
        console.log("Signer may already exist:", err);
      }
    }
  },
});
```

### 2.4 Build `/connect` page

**New file:** `connect/src/app/(connect)/connect/page.tsx` (inside the route group)

Delegates to a `use-connect-page.ts` hook. Wrapped in `<Suspense>` because `useSearchParams` requires it.

**New file:** `connect/src/app/(connect)/connect/use-connect-page.ts` --- Logic hook:

This page handles the full connect flow:

1. Parse `?sessionId=xxx&secret=xxx` from URL
2. If user not signed in → show Privy login
3. After login → call `addSigners()` + sign master key message in browser
4. Show "Launch Data Connect" button with deep link

**Important: OAuth redirect query param preservation.** OAuth redirects will lose `sessionId` and `secret` if not preserved. The `useLogin` config should include a `redirectUri` that carries the session params back through the OAuth flow:

```typescript
const { login } = useLogin({
  onComplete: async (user) => {
    /* addSigners + signing logic */
  },
});

// When triggering login, ensure the redirect preserves params:
// Privy appends its OAuth params alongside the existing query params
// as long as the redirect URL is on the same origin.
```

```tsx
"use client";

import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Views: "loading" | "login" | "signing" | "ready" | "error"

export default function ConnectPage() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const searchParams = useSearchParams();
  const [masterKeySig, setMasterKeySig] = useState<string | null>(null);

  const sessionId = searchParams.get("sessionId");
  const secret = searchParams.get("secret");
  const walletAddress = wallets[0]?.address;

  // After authentication, sign the master key message
  useEffect(() => {
    if (!authenticated || !walletAddress || masterKeySig) return;

    signMessage({ message: "vana-master-key-v1" })
      .then(({ signature }) => setMasterKeySig(signature))
      .catch(console.error);
  }, [authenticated, walletAddress, masterKeySig, signMessage]);

  // Build the deep link URL (wallet address omitted; Data Connect derives it from masterKeySig)
  const deepLink = masterKeySig
    ? `vana://connect?sessionId=${sessionId}&secret=${secret}&masterKeySig=${masterKeySig}`
    : null;

  if (!ready) return <LoadingScreen />;
  if (!authenticated) return <LoginScreen onLogin={login} />;
  if (!masterKeySig) return <LoadingScreen text="Signing key..." />;

  return (
    <div>
      <h1>Launch Data Connect</h1>
      <a href={deepLink!}>Open Data Connect</a>
      {/* Also show download link for users who don't have it */}
      <a href="https://vana.org/download">
        Don't have Data Connect? Download it
      </a>
    </div>
  );
}
```

**Note:** The `/connect` page does NOT do server registration. Server registration moves to Data Connect (Part 3), which calls `/api/sign` when needed. The `/connect` page only: authenticate, add signer, sign master key, deep link back.

### 2.5 Build `POST /api/sign` route

**New file:** `connect/src/app/api/sign/route.ts`

This is the signing oracle. Data Connect calls this when it needs a signature.

**Authentication:** The master key signature itself serves as the auth token. The server recovers the wallet address from it, which identifies the user and proves the caller possesses the signature.

**CORS:** Tauri desktop apps send HTTP requests without an `Origin` header. Use `Access-Control-Allow-Origin: *`. This is acceptable because the endpoint authenticates cryptographically via `masterKeySignature`, not via origin-based trust.

```typescript
import { PrivyClient } from "@privy-io/node";
import { hashMessage, recoverAddress } from "viem";
import { type NextRequest, NextResponse } from "next/server";
import { validateSignRequest } from "./sign-validation";

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

const SIGNER_PRIVATE_KEY = process.env.PRIVY_SIGNER_PRIVATE_KEY!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Preflight handler for CORS
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { masterKeySignature, message, typedData, type } = body;

    if (!masterKeySignature) {
      return NextResponse.json(
        { error: "Missing masterKeySignature" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    // Validate against allowlist
    const validation = validateSignRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // 1. Recover wallet address from the master key signature
    const walletAddress = await recoverAddress({
      hash: hashMessage("vana-master-key-v1"),
      signature: masterKeySignature as `0x${string}`,
    });

    // 2. Look up Privy wallet ID for this address
    const walletId = await lookupWalletId(walletAddress);
    if (!walletId) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // 3. Sign using the signer private key (no JWT needed)
    //    NOTE: The exact @privy-io/node API shape for signMessage/signTypedData
    //    should be verified against the installed SDK version's TypeScript types.
    let signature: string;

    if (type === "personal_sign") {
      const result = await privy
        .wallets()
        .ethereum()
        .signMessage(walletId, {
          message,
          authorization_context: {
            authorization_private_keys: [SIGNER_PRIVATE_KEY],
          },
        });
      signature = result.signature;
    } else {
      // EIP-712 typed data
      const result = await privy
        .wallets()
        .ethereum()
        .signTypedData(walletId, {
          typed_data: typedData,
          authorization_context: {
            authorization_private_keys: [SIGNER_PRIVATE_KEY],
          },
        });
      signature = result.signature;
    }

    return NextResponse.json({ signature }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Signing error:", err);
    return NextResponse.json(
      { error: "Signing failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

// Wallet address → Privy wallet ID lookup
// Option A: Query Privy API (simpler, no DB)
// Option B: Store mapping in a database during onboarding (faster)
async function lookupWalletId(walletAddress: string): Promise<string | null> {
  // Using Privy API to search by wallet address
  const users = await privy.users().list({
    wallet_address: walletAddress,
  });
  if (!users.data?.[0]) return null;

  const wallet = users.data[0].linked_accounts?.find(
    (a: any) =>
      a.type === "wallet" &&
      a.address?.toLowerCase() === walletAddress.toLowerCase(),
  );
  return wallet?.id ?? null;
}
```

### 2.6 Restrict what `/api/sign` can sign

Extract validation into a separate module for testability.

**New file:** `connect/src/app/api/sign/sign-validation.ts`

```typescript
const ALLOWED_MESSAGES = ["vana-master-key-v1"];

const ALLOWED_TYPED_DATA_PRIMARY_TYPES = [
  "ServerRegistration",
  "ServerDeregistration",
];

const ALLOWED_TYPES = ["personal_sign", "eth_signTypedData_v4"] as const;

type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateSignRequest(body: {
  type?: string;
  message?: string;
  typedData?: { primaryType?: string };
}): ValidationResult {
  const { type, message, typedData } = body;

  if (!type || !ALLOWED_TYPES.includes(type as any)) {
    return { valid: false, reason: "Invalid signing type" };
  }

  if (type === "personal_sign") {
    if (!ALLOWED_MESSAGES.includes(message ?? "")) {
      return { valid: false, reason: "Message not in allowlist" };
    }
  }

  if (type === "eth_signTypedData_v4") {
    if (
      !ALLOWED_TYPED_DATA_PRIMARY_TYPES.includes(typedData?.primaryType ?? "")
    ) {
      return {
        valid: false,
        reason: "Typed data primaryType not in allowlist",
      };
    }
  }

  return { valid: true };
}
```

### 2.7 Environment variables

```
# Public (exposed to browser)
NEXT_PUBLIC_PRIVY_APP_ID=...
NEXT_PUBLIC_PRIVY_CLIENT_ID=...
NEXT_PUBLIC_KEY_QUORUM_ID=...

# Private (server-only)
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_SIGNER_PRIVATE_KEY=...     # From Dashboard authorization key
```

---

## Part 3: Data Connect (databridge) Changes

### 3.1 Files to DELETE

| File/Directory                               | What it does                                                 | Why delete                       |
| -------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `src/auth-page/` (entire dir)                | Privy Core JS SDK auth, OAuth, wallet signing, HTML template | Auth moves to account.vana.org   |
| `src-tauri/src/commands/auth.rs`             | Rust HTTP server on localhost:3083, serves auth page         | No more local auth server        |
| `src/components/providers/PrivyProvider.tsx` | Privy React provider wrapper                                 | No more Privy SDK in desktop app |
| `vite.auth.config.ts`                        | Vite build config for auth page                              | Auth page deleted                |

### 3.2 Update deep link handler

**File:** `src/hooks/use-deep-link.ts`

Current URL format: `vana://connect?sessionId=xxx&secret=xxx`
New URL format: `vana://connect?sessionId=xxx&secret=xxx&masterKeySig=xxx`

Parse the master key signature, derive the wallet address from it:

```typescript
import { hashMessage, recoverAddress } from "viem";

// Extract masterKeySig from the deep link
const masterKeySignature = url.searchParams.get("masterKeySig");

// Derive wallet address (no need to pass it explicitly)
const walletAddress = masterKeySignature
  ? await recoverAddress({
      hash: hashMessage("vana-master-key-v1"),
      signature: masterKeySignature as `0x${string}`,
    })
  : null;

// Store in Redux state
if (walletAddress && masterKeySignature) {
  dispatch(setAuth({ walletAddress, masterKeySignature }));
}
```

### 3.3 Create account API service

**New file:** `src/services/accountApi.ts`

This replaces all Privy wallet signing with HTTP calls to account.vana.org:

```typescript
const ACCOUNT_API_URL = "https://account.vana.org";

export async function signMessage(
  masterKeySignature: string,
  message: string,
): Promise<string> {
  const res = await fetch(`${ACCOUNT_API_URL}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      masterKeySignature,
      message,
      type: "personal_sign",
    }),
  });

  if (!res.ok) throw new Error(`Sign failed: ${res.status}`);
  const { signature } = await res.json();
  return signature;
}

export async function signTypedData(
  masterKeySignature: string,
  typedData: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${ACCOUNT_API_URL}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      masterKeySignature,
      typedData,
      type: "eth_signTypedData_v4",
    }),
  });

  if (!res.ok) throw new Error(`Sign failed: ${res.status}`);
  const { signature } = await res.json();
  return signature;
}
```

### 3.4 Update grant flow and server registration

**File:** `src/pages/grant/use-grant-flow.ts`

Replace `startBrowserAuth()` (which launched the Privy auth page) with a check that auth state is already populated from the deep link. If not, redirect the user back to account.vana.org.

**Server registration** currently signs EIP-712 typed data via the Privy embedded wallet. Replace with:

```typescript
import { signTypedData } from "@/services/accountApi";

// Where server registration signing currently happens:
const signature = await signTypedData(masterKeySignature, {
  types: {
    EIP712Domain: EIP712_DOMAIN_FIELDS,
    ServerRegistration: [
      { name: "ownerAddress", type: "address" },
      { name: "serverAddress", type: "address" },
      { name: "publicKey", type: "string" },
      { name: "serverUrl", type: "string" },
    ],
  },
  domain: VANA_TYPED_DATA_DOMAIN,
  primaryType: "ServerRegistration",
  message: {
    ownerAddress: walletAddress,
    serverAddress,
    publicKey,
    serverUrl,
  },
});
```

The same pattern applies for `ServerDeregistration`.

### 3.5 Update auth state

**File:** `src/hooks/useAuth.ts`

Simplify to:

```typescript
function useAuth() {
  const { walletAddress, masterKeySignature } = useSelector(
    (state) => state.app.auth,
  );
  const isAuthenticated = Boolean(walletAddress && masterKeySignature);

  return { isAuthenticated, walletAddress, masterKeySignature };
}
```

No Privy readiness checks, no `PRIVY_APP_ID` environment variable needed.

### 3.6 Personal Server startup --- no changes needed

`src/hooks/usePersonalServer.ts` and `src-tauri/src/commands/server.rs` already consume `walletAddress` and `masterKeySignature` from Redux state and pass them as environment variables:

- `OWNER_ADDRESS` ← `walletAddress`
- `VANA_MASTER_KEY_SIGNATURE` ← `masterKeySignature`

These are now populated from the deep link instead of the Privy auth flow, but the consumption is identical.

### 3.7 Remove Privy packages

```diff
# package.json
- "@privy-io/js-sdk-core": "...",
- "@privy-io/react-auth": "...",
```

Remove build scripts: `auth:build`, `auth:dev`.

### 3.8 Update Rust commands

Remove `auth.rs` from `src-tauri/src/commands/mod.rs` and remove `start_browser_auth` from the Tauri command registrations.

Keep the proxy endpoints (`/register-server`, `/deregister-server`) if they're still needed by the grant flow, or migrate them to call account.vana.org/api/sign instead.

---

## Part 4: Privy Dashboard Setup

1. Go to **Privy Dashboard** → your app
2. Navigate to **Wallet Infrastructure** → **Authorization keys**
3. Click **New key** → save the **Private key** securely (Privy will not store it)
4. Click **New key** → **Register key quorum instead**
5. Paste the public key, set **Authorization threshold** to **1**, name it (e.g., "Vana Account Signer")
6. Save the **Key Quorum ID** --- this is the `signerId` used in `addSigners()`
7. Ensure **embedded wallet creation** is enabled in Dashboard settings
8. Ensure the **same Privy App ID** is used for account.vana.org as was used in Data Connect

### Environment variables to configure:

| Variable                      | Where                   | Value                |
| ----------------------------- | ----------------------- | -------------------- |
| `NEXT_PUBLIC_PRIVY_APP_ID`    | account.vana.org        | From Privy Dashboard |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | account.vana.org        | From Privy Dashboard |
| `NEXT_PUBLIC_KEY_QUORUM_ID`   | account.vana.org        | From step 6 above    |
| `PRIVY_APP_ID`                | account.vana.org server | Same as public       |
| `PRIVY_APP_SECRET`            | account.vana.org server | From Privy Dashboard |
| `PRIVY_SIGNER_PRIVATE_KEY`    | account.vana.org server | From step 3 above    |

---

## Security Considerations

### Master key signature as auth token

The `masterKeySignature` (EIP-191 signature of `"vana-master-key-v1"`) serves as the authentication credential for `/api/sign`. Properties:

- **Unique per user**: Different wallet = different signature
- **Self-identifying**: `ecrecover` extracts the wallet address
- **Permanent**: Cannot be rotated without a new wallet
- **Already the root credential**: Derives the Personal Server keypair, so if it's compromised, signing API abuse is secondary

### `/api/sign` hardening

- **Allowlist messages**: Only permit `"vana-master-key-v1"`, `ServerRegistration`, `ServerDeregistration`
- **Rate limiting**: Prevent abuse (e.g., 10 requests/minute per wallet)
- **CORS**: `Access-Control-Allow-Origin: *` with `OPTIONS` preflight (Tauri has no `Origin` header; auth is cryptographic)
- **HTTPS only**: All traffic between Data Connect and account.vana.org over TLS

### Signer security

- The signer private key can sign from **any** user's wallet that has it added
- Store it as an encrypted environment variable, never in source control
- Consider adding Privy **policies** to restrict what the signer can sign (e.g., only `personal_sign` and specific EIP-712 types)

---

## Resolved Design Decisions

1. **Server registration timing**: Server registration moves to Data Connect (Part 3) via `/api/sign`. The `/connect` page only: authenticate, add signer, sign master key, deep link back.

2. **CORS for desktop app**: Use `Access-Control-Allow-Origin: *` with an `OPTIONS` preflight handler. The endpoint authenticates cryptographically via `masterKeySignature`, so open CORS is acceptable.

3. **`addSigners` call frequency**: Call on every login (not just new users), wrapped in try/catch. Privy throws if the signer already exists, which is safe to ignore.

4. **`useVanaData.connectUrl` naming collision**: `UseVanaDataConfig.connectUrl` already means "local API route URL" (default `/api/connect`). The new account.vana.org URL is read from the API response inside `initConnect`, not from the config.

5. **Route-group isolation**: The `PrivyProvider` wraps only `/connect` via a `(connect)` route group layout. Existing `/` and `/grants` pages (using `@privy-io/js-sdk-core`) are untouched.

6. **Wallet ID lookup strategy**: Use Privy API search on every `/api/sign` call. No database needed.

7. **OAuth query param preservation**: Pass `redirectUri` with session params (`sessionId`, `secret`) in `useLogin` config. Privy appends its OAuth params alongside ours, so session context survives the redirect.

## Open Questions

1. **`@privy-io/node` API shape**: The exact method signatures for `signMessage` and `signTypedData` on the `wallets().ethereum()` interface should be verified against the installed SDK version's TypeScript types. The Privy docs primarily show `signMessage` examples for the Node SDK; `signTypedData` examples are sparse.

2. **`@privy-io/react-auth` `useSignMessage` shape**: The exact hook signature should be verified after installation. The code examples above use `signMessage({ message: '...' })` which may differ in the installed version.
