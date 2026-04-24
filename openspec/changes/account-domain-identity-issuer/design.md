## Context

`vana-connect` contains two related products:

- the published `@opendatalabs/connect` SDK and CLI under `src/`
- the account-domain Next.js app under `connect/`, deployed as `account.vana.org` / `account-dev.vana.org`

The account app already owns the web login and handoff surfaces:

- `/login` uses Privy email OTP and Google/Apple OAuth through `@privy-io/react-auth`.
- `/connect` requires Privy auth, provisions or finds the embedded wallet, signs `vana-master-key-v1`, and builds a `vana://connect?...` deep link.
- `/auth/device` and `/api/auth/device/*` implement CLI device-code auth, issuing opaque `vana_sess_...` tokens stored in Neon.
- `/api/sign` uses Privy server-side signing for allowlisted message / typed-data payloads.
- Neon persistence already exists for `personal_servers`, `device_codes`, and opaque `sessions`.

What is missing is a Vana-owned identity issuer. Mobile, DataConnect, Context Gateway, and builder-facing APIs should not need to verify Privy, Oko, Para, Supabase, email, phone, or app-specific sessions. They should verify a Vana-issued credential whose canonical subject is the wallet address.

This design starts that issuer as a minimal JWT/JWKS account-domain service. It is intentionally not a full OIDC provider yet. OIDC-compatible "Log in with Vana" should be included optimistically if it can ride the first issuer implementation without blocking the core identity and DP RPC integration checkpoint.

## Goals / Non-Goals

**Goals:**

- Add a provider-agnostic issuer contract on `account.vana.org`.
- Use wallet address as the canonical subject for Vana credentials.
- Support current Privy account-domain auth and a future Oko-backed mobile flow through provider verifier adapters.
- Issue short-lived Vana JWT access tokens and account-domain refresh sessions.
- Publish JWKS so downstream services can verify Vana tokens without provider SDKs.
- Persist challenges, refresh sessions, provider links, and signing-key metadata in a testable way.
- Preserve current DataConnect handoff, CLI device-code auth, and `/api/sign` behavior until explicit migration tasks replace them.

**Non-Goals:**

- Do not implement Oko SDK integration or self-hosted/forked Oko infrastructure in this change.
- Do not assume Oko supports silent signing, EIP-7702, smart-account APIs, or wallet permission APIs.
- Do not replace DataConnect handoff or CLI auth in the first issuer slice.
- Do not auto-merge accounts by email, phone, provider id, or provider user id.
- Do not implement protocol grant/delegation semantics here; the issuer authenticates a wallet-rooted product session.
- Do not let full OIDC provider work block the core issuer and DP RPC attribution checkpoint.

## Decisions

### D1. Public account-domain contract uses `/v1/auth/*`

Add stable public endpoints under the account domain:

- `POST /v1/auth/challenge`
- `POST /v1/auth/token`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /.well-known/jwks.json`

Next.js implementation files can live under `connect/src/app/v1/auth/**/route.ts` and `connect/src/app/.well-known/jwks.json/route.ts`.

Alternative considered: place the public API under `/api/auth/*` to match existing internal routes. `/api/auth/device` can remain where it is, but `/v1/auth/*` is a cleaner external contract for mobile and downstream services.

### D2. Minimal JWT issuer first, OIDC-compatible "Log in with Vana" as optimistic goal

Issue RS256 JWT access tokens with:

- `iss`: `https://account.vana.org` or `https://account-dev.vana.org`
- `sub`: normalized wallet address
- `walletAddress`: normalized wallet address
- `aud`: requested and allowed audience
- `iat`, `exp`, `jti`
- optional `provider`, `providerSubject`, and `sessionId` claims for audit/debug only

Publish public keys through JWKS. Do not add OIDC discovery, authorization-code flow, userinfo, dynamic client registration, or standard OAuth client management in the first slice.

Optimistic shape: `account.vana.org` can become an OIDC-compatible "Log in with Vana" provider once the core issuer semantics are working. That would let internal Next.js apps, builder apps, and partner surfaces use standard OAuth/OIDC client libraries while still receiving Vana-issued, wallet-rooted identity. Oko, Privy, Para, or another wallet provider remain upstream proof mechanisms.

Alternative considered: make full OIDC mandatory before the first integration checkpoint. That may become useful, but it would add authorization-code flow, PKCE, client registration, redirect URI management, userinfo, logout/session semantics, consent screens, and compatibility testing before the mobile/product identity contract and first DP RPC user-scoped write are proven.

### D3. Issuer supports DP RPC attribution but not DP RPC storage

The first integration checkpoint requires at least one user-scoped event written through DP RPC as the wallet-rooted user. The issuer's responsibility is to provide a verifiable identity credential and subject model that a DP RPC writer can use for attribution.

The issuer is not responsible for deciding where DP RPC stores records. It only needs to make the wallet-rooted subject, issuer, audience, expiration, key id, and verification behavior clear enough for DP RPC writers and builder-facing consumers to verify the user context.

Alternative considered: couple the issuer design to hosted storage topology. That would make auth implementation depend on a storage decision that is not required for the first checkpoint.

### D4. Wallet address is canonical; provider identity is evidence

Provider verifiers return an `AuthProofResult`:

```ts
type AuthProofResult = {
  provider: "privy" | "oko" | "mock";
  providerSubject: string;
  providerSessionId?: string;
  walletAddress: `0x${string}`;
  authTime?: string;
  email?: string;
  phone?: string;
};
```

Only `walletAddress` becomes canonical identity. Provider ids and contact fields can be stored for audit and provider-session validation, but they must not become account subjects or merge keys.

Alternative considered: use Privy/Oko user id as `sub`. That would make provider migration and mobile/DataConnect/CG identity continuity harder.

### D5. Provider verifier adapter boundary

Create a verifier interface under `connect/src/lib/auth/provider-verifiers/`:

```ts
type VerifyProviderProofInput = {
  provider: string;
  proof: unknown;
  challenge?: AuthChallenge;
  expectedAudience: string;
};

type ProviderVerifier = {
  verify(input: VerifyProviderProofInput): Promise<AuthProofResult>;
};
```

Initial adapters:

- `privy`: verifies a Privy access token using `@privy-io/node`, resolves the embedded wallet address, and returns the Privy user id as `providerSubject`.
- `mock`: test-only verifier for local contract tests.
- `oko`: interface and task placeholder only until Oko proof format is confirmed.

Alternative considered: implement Oko directly first. Current evidence does not yet identify the exact Oko proof/account-session contract, so direct implementation would be speculative.

### D6. Challenge is one-time and short-lived

`POST /v1/auth/challenge` creates a short-lived challenge with:

- challenge id
- random nonce
- requested audience
- optional provider hint
- expiration timestamp
- canonical message, for wallet-signature fallback: `vana-auth-v1:<challengeId>:<nonce>:<audience>`

`POST /v1/auth/token` must consume the challenge exactly once. If the submitted proof type can cryptographically bind to the challenge, it must do so. If a provider proof cannot bind to the challenge, the verifier must still validate provider token audience, expiration, issuer, and session freshness.

Alternative considered: token exchange without challenge. Simpler, but it weakens replay protection and makes wallet-signature fallback harder to standardize.

### D7. Token exchange supports provider proof and explicit wallet proof

`POST /v1/auth/token` accepts:

- provider proof: current Privy token or future Oko proof that resolves to a wallet address
- explicit wallet signature proof: signature over the challenge message, used for self-custody or provider-independent fallback

Routine mobile session refresh must use account-domain refresh semantics, not repeated wallet signing. If a wallet proof is requested in product UX, it is an explicit authority event.

Alternative considered: require wallet signature for every token exchange. That conflicts with the desired non-crypto-native mobile UX and the Oko silent-signing boundary.

### D8. Access tokens are JWTs; refresh tokens are opaque and stored hashed

The token response returns:

- `accessToken`: short-lived JWT, initially 10-15 minutes unless product/security chooses otherwise
- `refreshToken`: opaque random token stored hashed in Neon
- `expiresIn`
- `walletAddress`

Refresh sessions are revocable. `POST /v1/auth/refresh` rotates refresh tokens. `POST /v1/auth/logout` revokes the current refresh session.

Alternative considered: long-lived JWT only. That is simpler but makes revocation and provider/session invalidation harder.

### D9. Add issuer-specific persistence instead of overloading device-code tables

Keep existing `device_codes` and `sessions` tables for CLI/device auth. Add issuer-specific tables, likely:

- `auth_challenges`
- `auth_provider_links`
- `auth_refresh_sessions`
- `auth_signing_keys` or signing-key metadata if private keys live outside the DB

This avoids mixing opaque CLI tokens with mobile/backend Vana identity tokens.

Alternative considered: extend the existing `sessions` table. It is currently shaped around device-code CLI auth and Personal Server session token provisioning, so overloading it would make migration and tests less clear.

### D10. Signing keys need explicit storage and rotation

Use `jose` as a direct dependency for JWT/JWK work. The first implementation can load active RS256 private key material from environment or a managed secret, but it must publish `kid`-versioned public keys through JWKS and keep retired public keys available until all issued tokens expire.

The production storage choice remains open:

- Vercel/hosting env vars for first slice
- Neon metadata plus private key in secret manager
- cloud KMS or dedicated key service

Alternative considered: HS256 shared-secret JWTs. That would force downstream services to share a signing secret and is the wrong direction for provider-agnostic verification.

### D11. Existing account flows migrate incrementally

The first issuer implementation should not break:

- `/login`
- `/connect`
- `/auth/device`
- `/api/auth/device/*`
- `/api/sign`

After issuer endpoints work, follow-up changes can decide whether `/connect` obtains a Vana JWT, whether CLI auth returns JWTs instead of opaque `vana_sess_...`, and whether downstream clients move from custom session tokens to JWT verification.

Alternative considered: replace all account auth flows atomically. That increases risk and makes it harder to isolate issuer correctness.

## Risks / Trade-offs

- Oko proof format is unknown. Mitigation: create the provider verifier interface and mock/Privy adapters first; leave Oko adapter blocked on a concrete proof contract.
- Signing-key storage can become a production security risk. Mitigation: require `kid`, JWKS, key rotation tests, and an explicit storage decision before production rollout.
- Email/provider-id auto-merge would corrupt account identity. Mitigation: require wallet-address subject semantics and tests for same email / different wallet behavior.
- JWTs can become too broad if audiences are loose. Mitigation: require allowlisted audiences and token verification tests that reject wrong `aud` and `iss`.
- Existing `/api/sign` uses a Privy signer path that bypasses user JWTs. Mitigation: keep it transitional and allowlisted; do not expand it as part of issuer work.
- Challenge binding may vary by provider. Mitigation: document verifier-specific assurance and require provider token issuer/audience/expiration checks even when challenge binding is unavailable.
- Forked/self-hosted Oko may allow no-prompt signing. Mitigation: keep no-prompt wallet-authority behavior outside this issuer unless backed by a separate delegated/session authority contract.
- OIDC can expand the project scope before the core identity boundary is proven. Mitigation: include "Log in with Vana" optimistically, but keep it separable from the core issuer and DP RPC attribution checkpoint.

## Migration Plan

1. Add issuer data model and auth helper modules behind tests.
2. Implement `/.well-known/jwks.json` and local token signing/verification tests.
3. Implement `POST /v1/auth/challenge`.
4. Implement `POST /v1/auth/token` with mock and Privy provider verifiers plus explicit wallet-signature fallback.
5. Implement refresh/logout with refresh-token rotation and revocation.
6. Add provider-independence tests, audience/issuer rejection tests, and no-email-auto-merge tests.
7. Add a downstream verification fixture for the first DP RPC writer or builder-facing consumer audience.
8. Wire a narrow account-app integration path only after endpoint contracts are passing.
9. Add the Oko verifier when Oko proof format and self-hosted/forked deployment boundaries are confirmed.
10. Include OIDC-compatible "Log in with Vana" in the first issuer implementation if it can be completed without blocking the core checkpoint; otherwise split it into a follow-up OpenSpec change.

Rollback for the first slice is straightforward if existing routes are preserved: disable the new `/v1/auth/*` endpoints or stop issuing tokens. Existing `/connect`, `/auth/device`, and `/api/sign` flows continue to function.

## Open Questions

- What exact Oko proof will `account.vana.org` verify: Oko provider token, Oko session assertion, wallet signature, or a Vana-controlled Oko backend assertion?
- Which audiences are required for Stage 1: mobile, DataConnect, Context Gateway, builder-facing API, Personal Server, or a smaller subset?
- Where should RS256 private keys live for production: env/secret manager, KMS, or another account-domain key service?
- What are the initial access-token and refresh-token lifetimes?
- Should refresh tokens be returned in JSON for native mobile only, set as httpOnly cookies for web, or both depending on client type?
- Does the first implementation need a Vana JWT in the existing `/connect` DataConnect handoff, or only for the new mobile auth path?
- Should `/api/sign` remain Privy-specific until replaced by delegated/session authority, or should it start requiring a Vana JWT immediately?
- Which concrete DP RPC writer or builder-facing consumer should be the first verifier of Vana-issued credentials?
- Which concrete client should justify OIDC-compatible "Log in with Vana" first: an internal Vana web app, DataConnect, Context Gateway / builder apps, or an external partner?
