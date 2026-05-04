# Account-Domain Identity Issuer Handoff

Date: 2026-04-27

This memo is the auth-side companion to the mobile Stage 1 handoff memo in `vana-connect-mobile`:

- `docs/product/stage-1-handoff-memo.md`
- `docs/product/stage-1-execution-brief.md`

The active auth issuer PR is <https://github.com/vana-com/vana-connect/pull/112>. The related mobile staging PR is <https://github.com/vana-com/vana-connect-mobile/pull/1>.

## Purpose

This OpenSpec change defines the `account.vana.org` / `account-dev.vana.org` identity issuer that should give mobile, DataConnect, DP RPC writers, and builder-facing consumers a provider-independent Vana identity contract.

The issuer's core responsibility is to resolve upstream auth or wallet proof into a Vana-issued, wallet-rooted credential. Downstream systems should verify Vana credentials. They should not verify Oko, Privy, Para, Supabase, email, phone, or app-session identifiers as the canonical user identity.

## Current Auth-Side Stance

- `account.vana.org` is the default issuer home unless implementation proves it structurally wrong.
- Wallet address is the canonical user subject.
- Provider identity is evidence, not the account subject or merge key.
- Oko remains upstream wallet infrastructure behind the Vana issuer boundary.
- Stock Oko is acceptable until it blocks UX, security posture, or the proof contract.
- OIDC-compatible `Log in with Vana` should be included optimistically if it can ride the first issuer implementation without blocking the core checkpoint.
- The issuer supports DP RPC attribution by providing verifiable wallet-rooted identity context. It does not own DP RPC storage topology.
- Login does not imply app data grants, protocol delegation, or Personal Server authority.

## First Integration Checkpoint

The cross-repo checkpoint the issuer must support is:

1. A user signs into the future hosted mobile app through the Vana account flow.
2. The mobile app receives a wallet-rooted Vana identity from the account-domain issuer.
3. DataConnect continues or completes a handoff under the same wallet-rooted identity.
4. At least one user-scoped event is written through DP RPC as that wallet-rooted user.
5. A builder-facing path verifies or consumes the same identity contract without depending on provider-specific identifiers.

For this repo, the relevant checkpoint output is a verifiable issuer contract: JWT/JWKS, issuer, audience, wallet-rooted subject, expiration, key id, refresh semantics, and provider-independence tests.

## OpenSpec Artifacts

Read these first:

- `proposal.md`
- `design.md`
- `specs/account-domain-identity-issuer/spec.md`
- `tasks.md`

The spec includes requirements for:

- versioned auth endpoints
- challenge issuance
- token exchange
- wallet-rooted subject semantics
- provider verifier adapters
- JWT/JWKS verification
- refresh-session rotation and revocation
- issuer-specific persistence
- audience allowlisting
- downstream writer attribution
- signing-key management

## Implementation Boundaries

The first implementation should preserve these boundaries:

- Do not replace existing `/login`, `/connect`, `/auth/device`, `/api/auth/device/*`, or `/api/sign` behavior unless a scoped task explicitly does so.
- Do not overload existing CLI `device_codes` or opaque `sessions` tables as the primary issuer data model.
- Do not use email, phone, provider user id, Oko user id, Privy DID, Para DID, or app session id as the canonical user subject.
- Do not make OIDC mandatory before the core issuer and DP RPC attribution checkpoint work.
- Do not couple token verification to where DP RPC physically stores records.
- Do not represent a Vana session as protocol delegation or app data consent.

## Decisions Still Needed

- What exact Oko proof will `account.vana.org` verify?
- Which audiences are required first: mobile, DataConnect, DP RPC writer, builder-facing verifier, Personal Server, or a smaller subset?
- Which concrete DP RPC writer or builder-facing consumer should be the first verifier of Vana-issued credentials?
- Where should RS256 private keys live for production?
- What are the initial access-token and refresh-token lifetimes?
- Should refresh tokens be returned in JSON, httpOnly cookies, or client-type-specific response modes?
- Does `/connect` need an additive Vana JWT field in the first issuer slice?
- Should `/api/sign` remain Privy-specific until replaced by delegated/session authority, or should it require a Vana JWT sooner?
- Which concrete client justifies OIDC-compatible `Log in with Vana` first?

## Suggested Next Step

For a fresh Claude session starting implementation planning in this repo, begin with task group 1 in `tasks.md`. The highest-value first decision is the initial audience set, because it drives JWT claims, verification tests, mobile consumption, DP RPC writer attribution, and whether OIDC can reasonably ride the first implementation.

## Validation

Before claiming this OpenSpec change is ready, run:

```sh
openspec validate account-domain-identity-issuer --type change --strict --json
git diff --check -- openspec/changes/account-domain-identity-issuer
```
