## ADDED Requirements

### Requirement: Account domain exposes a versioned auth API

The account app SHALL expose provider-agnostic identity issuer endpoints under the account domain.

#### Scenario: Public auth endpoints exist

- **WHEN** a client calls the account-domain identity issuer
- **THEN** the issuer SHALL expose `POST /v1/auth/challenge`, `POST /v1/auth/token`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, and `GET /.well-known/jwks.json`

#### Scenario: Existing account routes continue to work

- **WHEN** the identity issuer endpoints are added
- **THEN** `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, and `/api/sign` SHALL preserve their existing request and response behavior unless a later OpenSpec change explicitly modifies them

### Requirement: Auth challenges are short-lived and single-use

The issuer SHALL create one-time auth challenges before issuing Vana credentials.

#### Scenario: Challenge issuance

- **WHEN** a client requests an auth challenge with an allowed audience
- **THEN** the issuer SHALL persist a random nonce, challenge id, requested audience, optional provider hint, expiration timestamp, and canonical wallet-signature message

#### Scenario: Challenge message format

- **WHEN** the issuer returns a challenge
- **THEN** the wallet-signature message SHALL include the challenge id, nonce, and audience in a deterministic `vana-auth-v1` format

#### Scenario: Expired challenge is rejected

- **WHEN** a client submits a token request with an expired challenge
- **THEN** the issuer SHALL reject the request without issuing an access token or refresh token

#### Scenario: Replayed challenge is rejected

- **WHEN** a client submits a second token request for a challenge that has already been consumed
- **THEN** the issuer SHALL reject the request without issuing another access token or refresh token

### Requirement: Token exchange accepts provider proof or explicit wallet proof

The issuer SHALL exchange a valid challenge plus valid proof for a Vana access token and refresh token.

#### Scenario: Provider proof resolves to wallet address

- **WHEN** a client submits a valid provider proof for a consumed challenge
- **THEN** the issuer SHALL verify the proof through the matching provider verifier and resolve the authenticated wallet address from that verifier result

#### Scenario: Wallet signature proof resolves to wallet address

- **WHEN** a client submits a valid signature over the challenge message
- **THEN** the issuer SHALL recover the wallet address from the signature and use that wallet address as the authenticated subject

#### Scenario: Invalid proof is rejected

- **WHEN** a client submits a missing, malformed, expired, wrong-audience, or unverifiable proof
- **THEN** the issuer SHALL reject the token request without consuming the proof as a valid login

#### Scenario: Token response shape

- **WHEN** a token exchange succeeds
- **THEN** the issuer SHALL return a short-lived JWT access token, an opaque refresh token, the access-token lifetime, and the normalized wallet address

### Requirement: Wallet address is the canonical subject

The issuer SHALL use normalized wallet address as the canonical identity in Vana-issued credentials.

#### Scenario: Access token subject is wallet-rooted

- **WHEN** the issuer signs an access token
- **THEN** the token `sub` claim and `walletAddress` claim SHALL both contain the normalized wallet address

#### Scenario: Provider identity is not canonical

- **WHEN** a provider verifier returns provider user id, email, phone, or provider session metadata
- **THEN** the issuer SHALL NOT use those provider fields as the token subject or as the account merge key

#### Scenario: Shared provider contact does not merge wallets

- **WHEN** two successful auth proofs have the same email or phone but resolve to different wallet addresses
- **THEN** the issuer SHALL preserve distinct wallet-rooted identities

### Requirement: Provider verification is isolated behind adapters

The issuer SHALL verify upstream auth providers through explicit provider verifier adapters.

#### Scenario: Verifier interface returns provider proof result

- **WHEN** a provider verifier accepts a provider proof
- **THEN** it SHALL return provider name, provider subject, authenticated wallet address, and optional provider session metadata

#### Scenario: Privy verifier is supported

- **WHEN** a client submits a Privy proof
- **THEN** the Privy verifier SHALL validate the Privy proof and resolve the embedded wallet address before the issuer signs a Vana token

#### Scenario: Mock verifier is test-only

- **WHEN** tests run issuer contract scenarios
- **THEN** a mock verifier MAY be used for deterministic tests and SHALL NOT be enabled for production account-domain traffic

#### Scenario: Oko verifier is blocked on proof contract

- **WHEN** the Oko proof format is not yet confirmed
- **THEN** the issuer SHALL NOT add speculative Oko-specific token verification behavior beyond the provider-verifier interface boundary

### Requirement: Access tokens are verifiable through JWKS

The issuer SHALL sign access tokens with asymmetric keys and publish public verification keys.

#### Scenario: JWT claims

- **WHEN** the issuer signs an access token
- **THEN** the token SHALL include `iss`, `sub`, `walletAddress`, `aud`, `iat`, `exp`, `jti`, and a `kid` header

#### Scenario: Issuer values match environment

- **WHEN** the issuer runs in production or development
- **THEN** the token `iss` claim SHALL match the configured account-domain issuer URL for that environment

#### Scenario: JWKS publishes active and needed retired keys

- **WHEN** a verifier requests `GET /.well-known/jwks.json`
- **THEN** the issuer SHALL return public JWKs for the active signing key and any retired signing keys still needed to verify unexpired tokens

#### Scenario: Downstream verification rejects wrong token context

- **WHEN** a downstream verifier receives a token with the wrong issuer, audience, signature, expiration, or key id
- **THEN** verification SHALL fail

### Requirement: Refresh sessions are opaque, hashed, rotatable, and revocable

The issuer SHALL use opaque refresh tokens backed by persisted refresh sessions.

#### Scenario: Refresh token is stored hashed

- **WHEN** the issuer creates a refresh session
- **THEN** it SHALL store only a hashed representation of the refresh token

#### Scenario: Refresh rotates token

- **WHEN** a client submits a valid refresh token to `POST /v1/auth/refresh`
- **THEN** the issuer SHALL revoke or supersede the previous refresh token and return a new access token and new refresh token

#### Scenario: Reused refresh token is rejected

- **WHEN** a client submits a refresh token that has already been rotated, revoked, expired, or otherwise invalidated
- **THEN** the issuer SHALL reject the refresh request

#### Scenario: Logout revokes refresh session

- **WHEN** a client submits a valid refresh token to `POST /v1/auth/logout`
- **THEN** the issuer SHALL revoke the associated refresh session so it cannot mint future access tokens

### Requirement: Issuer persistence is separate from existing device auth tables

The issuer SHALL persist issuer-specific state without overloading existing CLI device-code session tables.

#### Scenario: Issuer tables are distinct

- **WHEN** database migrations are added for the identity issuer
- **THEN** they SHALL add issuer-specific storage for auth challenges, provider-wallet links, refresh sessions, and signing-key metadata

#### Scenario: Existing CLI sessions are not repurposed

- **WHEN** the issuer stores mobile or account-domain refresh sessions
- **THEN** it SHALL NOT overload the existing `device_codes` or opaque CLI `sessions` schema as the primary issuer data model

#### Scenario: Provider links preserve audit metadata

- **WHEN** a provider proof succeeds
- **THEN** the issuer SHALL persist enough provider-link metadata to audit which provider proof established the wallet-rooted session without making that provider identity canonical

### Requirement: Audiences are allowlisted

The issuer SHALL issue tokens only for configured downstream audiences.

#### Scenario: Allowed audience succeeds

- **WHEN** a client requests a challenge and token for an allowed audience
- **THEN** the issuer SHALL include that audience in the issued access token

#### Scenario: Unknown audience fails

- **WHEN** a client requests a challenge or token for an unknown audience
- **THEN** the issuer SHALL reject the request

#### Scenario: Verification is audience-specific

- **WHEN** a downstream verifier validates a token
- **THEN** it SHALL require the expected audience rather than accepting any Vana-issued token

### Requirement: Signing-key management has an explicit production boundary

The issuer SHALL define signing-key loading and rotation behavior before production rollout.

#### Scenario: Key material is loaded from explicit configuration

- **WHEN** the issuer starts
- **THEN** it SHALL load active signing-key material from explicit account-domain configuration or managed secret storage, not from provider SDK configuration

#### Scenario: Key rotation keeps verification available

- **WHEN** the active signing key changes
- **THEN** the previous public key SHALL remain in JWKS until every token signed by that key has expired

#### Scenario: Missing signing configuration fails closed

- **WHEN** signing-key configuration is missing or invalid
- **THEN** the issuer SHALL fail token issuance rather than signing with an implicit fallback key
