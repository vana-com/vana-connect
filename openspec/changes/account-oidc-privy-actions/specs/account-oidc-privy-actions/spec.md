## ADDED Requirements

### Requirement: Account domain provides OIDC Login with Vana

`account.vana.org` SHALL provide an OIDC-compatible Login with Vana surface.

#### Scenario: OIDC provider mounting is spiked

- **WHEN** OIDC implementation begins
- **THEN** the implementation SHALL first select an issuer shape with evidence, including prior Vana Ory Hydra art, managed issuer options, and the completed `oidc-provider` route-handler spike

#### Scenario: Self-hosted Next route handler is not the default

- **WHEN** the completed `oidc-provider` route-handler spike is considered for production
- **THEN** the implementation SHALL treat it as fallback evidence and SHALL NOT merge it as default architecture until Ory/managed issuer options fail documented pass/fail criteria

#### Scenario: OIDC discovery is available

- **WHEN** a client fetches OIDC discovery
- **THEN** the account domain SHALL expose issuer metadata, authorization endpoint, token endpoint, JWKS URI, supported response types, scopes, signing algorithms, and PKCE support

#### Scenario: Authorization Code with PKCE succeeds

- **WHEN** a registered client starts an authorization request with valid redirect URI, state, nonce, and PKCE challenge
- **THEN** the account domain SHALL authenticate the user, issue an authorization code, and allow the client to exchange that code for OIDC tokens

#### Scenario: Standard client compatibility is tested

- **WHEN** Login with Vana is claimed as supported
- **THEN** the implementation SHALL pass a compatibility test with NextAuth/Auth.js or another agreed standard OIDC client

### Requirement: Vana account id is the OIDC subject

OIDC tokens SHALL use a Vana-owned account id as `sub`.

#### Scenario: Token is issued

- **WHEN** the account domain issues an ID token
- **THEN** `sub` SHALL be a stable `vana_user_id` and SHALL NOT be a Privy id, provider id, email, Google subject, or wallet address

#### Scenario: Wallets are exposed

- **WHEN** a client requests allowed wallet claims
- **THEN** wallet addresses SHALL be exposed as linked wallet claims or userinfo fields, not as the OIDC subject

### Requirement: Privy is behind a provider adapter

Privy SHALL be integrated as a wallet provider behind Vana account identity.

#### Scenario: Privy native login is used transitionally

- **WHEN** the first implementation uses the current Privy-native login
- **THEN** it SHALL create or resolve a Vana account and linked wallet record before issuing OIDC tokens

#### Scenario: First OIDC slice authenticates through Privy

- **WHEN** the first OIDC/action-code slice authenticates through the existing Privy-native login flow
- **THEN** the implementation SHALL label that dependency transitional and SHALL issue downstream tokens with `sub = vana_user_id`

#### Scenario: Privy custom auth target is implemented

- **WHEN** Vana-native auth is ready
- **THEN** Privy SHALL accept Vana-issued JWT/custom-auth proof rather than acting as the durable account issuer

#### Scenario: Provider id is stored

- **WHEN** Privy returns a provider user id or wallet id
- **THEN** the account domain MAY store it as provider-link audit metadata and SHALL NOT use it as the account merge key

### Requirement: OIDC scopes do not grant data access

OIDC scopes SHALL describe identity and account API access only.

#### Scenario: Client receives access token

- **WHEN** Memory App receives an OIDC access token
- **THEN** that token SHALL NOT by itself authorize reading user data, decrypting user data, or bypassing a separate consent/action flow

#### Scenario: Client requests data

- **WHEN** Memory App wants user data
- **THEN** it SHALL initiate an account-hosted data action or a later approved protocol consent flow separate from ordinary OIDC login

### Requirement: Account-hosted data actions use request/result codes

The account domain SHALL support account-hosted action requests for user-present wallet/data operations.

#### Scenario: Client creates action request

- **WHEN** a registered client requests a data action
- **THEN** the account domain SHALL persist an action request with client id, requested action, requested data categories/scopes, redirect URI, state binding, expiration, and display metadata

#### Scenario: User approves action

- **WHEN** the user approves an action request
- **THEN** the account domain SHALL record the consent/action decision and create a mock result, short-lived action result, or result reference according to the reviewed action type

#### Scenario: Redirect returns code only

- **WHEN** account redirects back to the client after action completion
- **THEN** the redirect SHALL include an action code and state, not raw user data

#### Scenario: Client exchanges action code

- **WHEN** the client exchanges an action code
- **THEN** the account domain SHALL verify client binding and code expiration before returning the result, encrypted bundle, or short-lived result reference

#### Scenario: First spike returns mock result

- **WHEN** the first Memory App fixture completes an approved data action
- **THEN** the account domain SHALL return a mock result through the action-code exchange and SHALL NOT process real user data

### Requirement: Plaintext behavior is explicit per action type

Every account-hosted data action SHALL document where plaintext can exist.

#### Scenario: Action type is registered

- **WHEN** an action type is added
- **THEN** it SHALL declare result mode, decryption location, plaintext visibility, expiration, and audit behavior

#### Scenario: Backend plaintext is not approved

- **WHEN** no design explicitly approves Vana/ODL backend plaintext access
- **THEN** account-hosted actions SHALL NOT require Vana/ODL backend services to see plaintext

#### Scenario: First non-mock result is returned

- **WHEN** the first non-mock data action returns data to Memory App or another client
- **THEN** the result SHALL be an encrypted bundle behind a short-lived reference unless a later design explicitly approves a different plaintext boundary

#### Scenario: Encrypted result is stored

- **WHEN** the account domain stores or references a non-mock action result
- **THEN** account backend storage SHALL contain ciphertext and metadata, not raw user-data plaintext

### Requirement: Wallet execution mode is explicit per action

Every account-hosted action SHALL distinguish embedded-wallet execution from BYO-wallet execution.

#### Scenario: Embedded wallet action is requested

- **WHEN** an action uses a Privy embedded wallet controlled through the account domain
- **THEN** the action record SHALL identify whether the operation is silent, user-present, or provider-policy dependent

#### Scenario: BYO wallet action is requested

- **WHEN** an action uses an external, injected, or hardware wallet
- **THEN** the account domain SHALL require a client/user wallet signature path and SHALL NOT assume backend silent signing is available

#### Scenario: Mock action is used

- **WHEN** the first Memory App spike uses a mock action result
- **THEN** the action record SHALL mark the execution mode as mock so the spike does not imply production wallet-signing behavior

### Requirement: Consent/action events are protocol-shaped

The account domain SHALL persist consent/action events in a shape that can later map to DP RPC or L1 anchoring.

#### Scenario: Material action step occurs

- **WHEN** an action is requested, approved, denied, completed, exchanged, or expired
- **THEN** the account domain SHALL persist an event with event id, schema version, event type, timestamp, issuer, `vana_user_id`, client id, action request id, requested data, execution mode, result mode, idempotency key, request hash, and audit metadata

#### Scenario: Protocol principal is not known

- **WHEN** an event does not yet have builder id, grantee address, grant id, permission id, or file id
- **THEN** the event SHALL preserve nullable protocol reference fields rather than inventing protocol identifiers

#### Scenario: Live DP RPC is not integrated

- **WHEN** the first OIDC/action-code spike runs without live DP RPC integration
- **THEN** account-local event persistence SHALL be accepted as the DP RPC-compatible mock if the record shape matches this contract

### Requirement: Existing account routes remain compatible

OIDC and action endpoints SHALL be additive unless a later change explicitly migrates existing flows.

#### Scenario: DataConnect handoff continues

- **WHEN** `/connect` is used by the existing DataConnect handoff
- **THEN** it SHALL continue to produce the existing deep-link behavior unless a later OpenSpec change modifies it

#### Scenario: Transitional signing remains bounded

- **WHEN** `/api/sign` remains available
- **THEN** it SHALL keep existing allowlisted signing behavior and SHALL NOT become the general-purpose account action API

### Requirement: Application records are separate from protocol principals

OIDC client/application records SHALL be distinct from protocol principal records.

#### Scenario: Memory App client is registered

- **WHEN** Memory App is added as an OIDC client
- **THEN** the record SHALL include client metadata independently from any builder address, grantee address, or protocol signing key

#### Scenario: Protocol principal is attached later

- **WHEN** a protocol principal is needed for the app
- **THEN** it SHALL be linked to the application record without replacing the OIDC client identity
