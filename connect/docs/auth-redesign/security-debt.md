# Vana Auth Redesign — Known Security Debt

Tracks deliberate scope deferrals from `00-execution-plan.md`. Each item is a non-blocking deferral with explicit defenses for the deferral window and a written trigger for taking it on.

## 1. `PRIVY_SIGNER_PRIVATE_KEY` lives in process memory

**Risk.** A leak of `PRIVY_SIGNER_PRIVATE_KEY` (env exfil, runtime memory dump, log line, exposed Vercel preview env, broken `.env` commit) lets the attacker — combined with a victim's `vana_session` and a valid `signing_authorization` — mint signatures for any user's embedded wallet for any allowlisted purpose.

**Why deferred.** KMS migration is a substantial cross-cutting change. The new `signing_authorizations` plane materially shrinks the blast radius vs. today's `master-key-signature` model: even with the key, the attacker still needs (a) a valid Vana session for the target user, (b) a valid `interactive_confirmations` row (for high-risk purposes), (c) a `signing_authorization` row that hasn't been consumed. Key alone is not sufficient.

**Defenses for the deferral window.**

- `signing_authorizations` table is the new control plane; route handlers MUST write a row before calling Privy SDK.
- `interactive_confirmations` required for `create_grant` and `register_personal_server`.
- Restrict env access: `PRIVY_SIGNER_PRIVATE_KEY` available only to the production runtime, not preview deploys.
- Telemetry: per-key-usage audit log, alert on unusual signing rate.
- 90-day key rotation policy.

**Trigger to take it on.**

- Multi-user beyond Tim, OR
- Adding a third party with on-chain stakes that signs against this key, OR
- Any incident involving env-var exfiltration anywhere in the org.

**Estimated work.** ~1 week for AWS KMS + Privy `authorization_signature` mode integration; depends on Privy supporting remote-signer mode, which needs verification with Privy.

## 2. Privy bridge nonce mechanism

**Risk.** `/api/auth/session` accepts a Privy id_token. Without a nonce, an attacker who obtains a victim's id_token (via a compromised app the victim also uses) within the 5-min `iat` window can replay it to `account.vana.org/api/auth/session` and mint a Vana session for that user.

**Why deferred.** Single-user system today. Real-world replay attack requires (a) a second app the user has logged into via the same Privy app id, (b) compromise of that app, (c) within 5 min. None of these conditions exist today.

**Defenses for the deferral window.**

- `aud === PRIVY_APP_ID` strictly asserted in code, with a unit test that rejects a token from a different Privy app.
- `iat` skew ≤5 min hard-rejected.
- Rate-limit `/api/auth/session` per IP/UA; alert on burst.
- One Privy app id; no other Vana property uses Privy yet.

**Trigger to take it on.**

- A second Vana property uses the same Privy app id, OR
- Privy adds nonce as a recommended/required pattern, OR
- Multi-user beyond Tim with login telemetry showing unexpected session creation rates.

**Estimated work.** ~1 day. Mechanism: client GETs nonce from `/api/auth/session/begin` (server sets HttpOnly origin-bound cookie + 5-min TTL row keyed by server-generated id, bound to the begin-cookie value). Privy login passes nonce. Client POSTs id_token + nonce; server validates `(begin-cookie value, nonce row, id_token.nonce claim)` all match, atomically consumes the row.

## 3. `signature_challenges` table for user-controlled EOAs

**Risk.** `wallet.signTypedData` returns `{ kind: "not_supported_yet" }` for `key_control_type === 'user_controlled_eoa'`. Any flow that needs to sign on behalf of a user-EOA fails.

**Why deferred.** Zero current EOA users. Privy embedded wallet is the only `key_control_type` in production data.

**Defenses for the deferral window.**

- Wallet API returns a structured negative response for user-EOAs that does not differentiate from "wallet not found" or "feature off" by shape or timing.
- Adding a user-EOA requires explicit opt-in; can be gated at the wallet-attach UI.

**Trigger to take it on.**

- First user adds an external EOA (MetaMask, hardware) via Privy or otherwise.
- Para or other connector-style provider integrated.

**Estimated work.** ~3 days. Adds `signature_challenges` table, generic two-phase protocol, client SDK helper for browser wallet signing, route adapter pattern.

## 4. `wallet_attestations` table

**Risk.** None today. Table proposed in earlier design rounds for audit metadata when smart-account / EIP-7702 / cross-provider verification arrives.

**Why deferred.** No flow uses it.

**Trigger to take it on.** EIP-7702 / smart-account flows, OR a multi-provider audit requirement.

## 5. Multi-instance tombstone propagation latency

**Risk.** `vana_session_tombstones` is DB-backed (correct). The introspection cache (per-lambda) is best-effort; cache hits within the 30s TTL re-validate against the DB tombstone before returning, so revocation propagation is bounded by DB read latency, not 30s.

**Why deferred.** Architecture is correct as written. This entry exists to document the explicit choice that introspection cache is not security-critical; the tombstone is.

**Defenses.**

- DB tombstone check on every cache hit.
- High-risk routes additionally gate via `interactive_confirmations`, which require a fresh user click and cannot be replayed from a cached session.

**Trigger to revisit.** Performance issue from per-request DB tombstone check (unlikely; one indexed PK lookup). If addressed, switch to Redis/Upstash with 5s TTL.
