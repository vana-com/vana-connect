## 1. Product and Security Decisions

- [ ] 1.1 Record the Stage 1 audience allowlist (`aud`) and the owning downstream service for each audience.
- [ ] 1.2 Record initial access-token lifetime and refresh-token lifetime for native mobile and web clients.
- [ ] 1.3 Decide whether Stage 1 refresh tokens are returned in JSON, httpOnly cookies, or client-type-specific response modes.
- [ ] 1.4 Decide production RS256 private-key storage for Stage 1: hosting secret, cloud KMS, or another managed secret path.
- [ ] 1.5 Confirm the Oko proof format that `account.vana.org` will verify before implementing an Oko verifier.
- [ ] 1.6 Decide whether `/connect` and CLI device auth stay fully unchanged in Stage 1 or also receive Vana JWTs as an additive field.
- [ ] 1.7 Add a short implementation note that separates identity issuer scope from protocol delegation / smart-contract permission scope.
- [ ] 1.8 Identify the first DP RPC writer or builder-facing consumer audience that must verify Vana-issued credentials.
- [ ] 1.9 Record OIDC-compatible "Log in with Vana" as an optimistic non-blocking goal and identify the first client that would justify implementing it.

## 2. Data Model

- [ ] 2.1 Add a migration for `auth_challenges` with challenge id, nonce hash or nonce, audience, provider hint, expiration, consumed timestamp, and created timestamp.
- [ ] 2.2 Add a migration for `auth_provider_links` keyed by normalized wallet address plus provider, with provider subject and audit metadata.
- [ ] 2.3 Add a migration for `auth_refresh_sessions` with hashed refresh token, normalized wallet address, audience, expiration, rotation/revocation fields, and session metadata.
- [ ] 2.4 Add a migration or configuration record for signing-key metadata, including `kid`, status, created timestamp, and retired timestamp.
- [ ] 2.5 Add typed database helpers for creating, consuming, expiring, and reading auth challenges.
- [ ] 2.6 Add typed database helpers for upserting provider links without using email, phone, or provider subject as the account merge key.
- [ ] 2.7 Add typed database helpers for creating, rotating, revoking, and validating refresh sessions.
- [ ] 2.8 Add migration tests or SQL checks that confirm issuer tables are separate from existing `device_codes` and CLI `sessions` tables.

## 3. Token and Key Infrastructure

- [ ] 3.1 Add `jose` as a direct dependency in the Next.js account app package.
- [ ] 3.2 Implement signing-key loading from explicit account-domain configuration with a fail-closed path for missing or invalid keys.
- [ ] 3.3 Implement RS256 JWT signing with `iss`, `sub`, `walletAddress`, `aud`, `iat`, `exp`, `jti`, and `kid`.
- [ ] 3.4 Implement JWT verification helpers that require expected issuer, expected audience, valid signature, valid expiration, and known `kid`.
- [ ] 3.5 Implement JWKS serialization for the active public key and retired public keys needed for unexpired tokens.
- [ ] 3.6 Add unit tests for valid token verification, wrong issuer, wrong audience, expired token, invalid signature, and unknown `kid`.
- [ ] 3.7 Add a key-rotation test proving a token signed by a retired key remains verifiable until expiration.

## 4. Provider Verification

- [ ] 4.1 Define the provider verifier interface and `AuthProofResult` type under `connect/src/lib/auth/provider-verifiers/`.
- [ ] 4.2 Implement a test-only mock verifier and ensure it cannot be selected in production configuration.
- [ ] 4.3 Implement the Privy verifier using the existing account-domain Privy server dependency and resolve the embedded wallet address.
- [ ] 4.4 Add Privy verifier tests for valid proof, expired or invalid proof, missing wallet, and provider subject audit fields.
- [ ] 4.5 Add a placeholder Oko verifier module that fails with an explicit unsupported-provider error until task 1.5 is complete.
- [ ] 4.6 Add tests proving provider ids, email, and phone are not used as token subject or account merge keys.

## 5. Auth API Routes

- [ ] 5.1 Implement `POST /v1/auth/challenge` with audience allowlist validation, nonce generation, canonical `vana-auth-v1` message, persistence, and expiration.
- [ ] 5.2 Add route tests for successful challenge issuance, unknown audience rejection, provider hint persistence, and response shape.
- [ ] 5.3 Implement `POST /v1/auth/token` for provider proof exchange, challenge consumption, Vana JWT issuance, refresh-token issuance, and provider-link audit persistence.
- [ ] 5.4 Implement explicit wallet-signature proof exchange using the canonical challenge message.
- [ ] 5.5 Add token route tests for valid provider proof, valid wallet proof, expired challenge, replayed challenge, invalid proof, and unknown audience.
- [ ] 5.6 Implement `POST /v1/auth/refresh` with hashed refresh-token lookup, rotation, access-token issuance, and reuse rejection.
- [ ] 5.7 Add refresh route tests for successful rotation, expired refresh token, revoked refresh token, and reused previous token.
- [ ] 5.8 Implement `POST /v1/auth/logout` with refresh-session revocation and idempotent response semantics.
- [ ] 5.9 Add logout route tests for active session, already-revoked session, and unknown token behavior.
- [ ] 5.10 Implement `GET /.well-known/jwks.json` and route tests for public key shape and cache headers.

## 6. Account App Integration Boundaries

- [ ] 6.1 Verify `/login` behavior remains unchanged after adding issuer routes.
- [ ] 6.2 Verify `/connect` still provisions the Privy embedded wallet, signs `vana-master-key-v1`, and produces the existing deep link.
- [ ] 6.3 Verify `/auth/device` and `/api/auth/device/*` continue to issue the existing opaque CLI session token shape.
- [ ] 6.4 Verify `/api/sign` keeps the existing allowlisted signing semantics and does not expand scope as part of the issuer change.
- [ ] 6.5 If task 1.6 chooses additive JWT fields for an existing flow, add compatibility tests proving existing clients can ignore the new fields.

## 7. Downstream Verification Contract

- [ ] 7.1 Add a small verifier helper or documented example for downstream services that need to validate Vana JWTs against JWKS.
- [ ] 7.2 Add a contract test proving downstream verification accepts a valid Vana token for the expected audience.
- [ ] 7.3 Add contract tests proving downstream verification rejects a valid Vana token for the wrong audience.
- [ ] 7.4 Document that downstream services must not call Privy, Oko, Para, Supabase, email, or phone providers to validate Vana identity.
- [ ] 7.5 Add a fixture showing a DP RPC writer can attribute one user-scoped event to the wallet-rooted Vana subject without depending on DP RPC storage topology.

## 8. Oko and Mobile Follow-up

- [ ] 8.1 Capture the confirmed Oko proof contract in the design doc or a follow-up OpenSpec change before writing Oko-specific code.
- [ ] 8.2 Define how mobile obtains a provider proof from the self-hosted or forked Oko deployment.
- [ ] 8.3 Define how mobile stores and refreshes account-domain refresh tokens.
- [ ] 8.4 Define whether mobile auth requires an explicit user-visible approval moment, a no-prompt Vana-owned flow, or both by product configuration.
- [ ] 8.5 Create a follow-up implementation change for the Oko verifier once tasks 1.5, 8.1, and 8.2 are complete.

## 9. OIDC-Compatible Log in with Vana Optimistic Goal

- [ ] 9.1 Define the minimum OIDC client target, such as Auth.js / NextAuth in an internal Next.js app, before implementing OIDC endpoints.
- [ ] 9.2 Define required OIDC endpoints and behavior: discovery, authorization code with PKCE, token endpoint compatibility, userinfo, client registration/configuration, redirect URI allowlisting, logout/session semantics, and standard error handling.
- [ ] 9.3 Define how OIDC consent differs from Vana data-grant consent so login does not imply protocol permission or data access.
- [ ] 9.4 Add compatibility tests against the selected first OIDC client library before treating "Log in with Vana" as supported.
- [ ] 9.5 Include OIDC implementation in the first issuer slice only if it does not block the core issuer and DP RPC attribution checkpoint; otherwise split it into a follow-up OpenSpec change.

## 10. Validation and Rollout

- [ ] 10.1 Run `cd connect && pnpm test` and fix issuer-related failures.
- [ ] 10.2 Run `cd connect && pnpm lint` and fix issuer-related failures.
- [ ] 10.3 Run `cd connect && pnpm build` and fix issuer-related failures.
- [ ] 10.4 Run `pnpm test` at the repo root if SDK or CLI contracts are touched.
- [ ] 10.5 Add account-domain environment documentation for issuer URL, audience allowlist, signing key, active `kid`, refresh-token settings, and provider verifier settings.
- [ ] 10.6 Add rollout notes covering dev deployment, production key provisioning, JWKS verification, and rollback by disabling `/v1/auth/*` issuance.
