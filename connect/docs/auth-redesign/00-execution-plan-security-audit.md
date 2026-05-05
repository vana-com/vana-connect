# Security Audit — Auth & Custody Redesign Execution Plan

Audit target: `docs/auth-redesign/00-execution-plan.md` (stage 0/1 design).
Reviewer mode: adversarial. Each finding is severity-tagged with concrete mitigation.

Severity legend: **CRITICAL** (exploitable, high blast radius), **HIGH** (exploitable, scoped blast), **MEDIUM** (requires chained conditions), **LOW** (defense-in-depth gap), **INFO** (design hardening).

---

## 1. CRITICAL — Auto-issued `signing_authorizations` make session-cookie theft equivalent to wallet compromise

Plan §5.4 (`00-execution-plan.md:146`): "on login, mint default authorizations for the session's primary wallet covering common purposes (e.g., `register_personal_server`, `create_grant`)."

**Threat.** Any code path that obtains the `vana_session` cookie (XSS, malicious browser extension, leaked log line, OAuth-redirect bug, subdomain takeover under `*.vana.org`) gains the ability to mint **arbitrary** `register_personal_server` and `create_grant` signatures for the user's embedded wallet. Because `PRIVY_SIGNER_PRIVATE_KEY` lives server-side and authority is implicit on session, the attacker never needs the user's wallet. The user has no UI confirmation step — auto-issuance is silent.

**Mitigations.**

- Do **not** auto-issue `create_grant`. Grants are the high-value target (data exfil). Require an interactive `signature_challenge` confirmation in the UI for every grant, OR require step-up reauth (Privy re-prompt) within the last 60 s.
- Tighten authority shape: `(vana_user_id, vana_wallet_id, purpose, max_uses, payload_constraints, expires_at)`. `max_uses=1` for `register_personal_server`. `payload_constraints` should bind to a specific PS URL hash / specific grantee + scope hash, not a blanket purpose.
- Authority issuance must be tied to a `vana_session_id` (not just `vana_user_id`); rotate authority when the refresh token rotates; revoke on logout (plan §5.5 mentions this — make it transactional).
- Add a `last_used_at` + per-purpose rate limiter; alert on >N signatures per session.

**Cite.** `src/app/api/sign/route.ts:35-110` already exposes the same anti-pattern today: `masterKeySignature` recovers a wallet address, and any caller with a valid signature over `"vana-master-key-v1"` can sign anything in the allowlist (`sign-validation.ts:3-7`). The redesign keeps the shape and adds session-bearer convenience — making the attack easier, not harder.

---

## 2. CRITICAL — Replay of a single `signing_authorization` to register multiple Personal Servers

Plan §5 does not state that each typed-data payload is uniquely bound to a server-side nonce. `register_personal_server` typed data (per existing `ServerRegistration` primary type, `sign-validation.ts:3-6`) is signed once but the on-chain contract may accept it multiple times if the typed-data hash is identical (or different-but-valid for distinct PS endpoints). Worse, the _authority_ itself permits N signatures unless `max_uses` is enforced.

**Threat.** Attacker with session cookie (or a compromised admin worker) calls `wallet.signTypedData({ purpose: "register_personal_server", ... })` repeatedly with different `serverUrl`/`publicKey` payloads to register a hostile PS _as the user_ — then receives grants meant for the legitimate PS.

**Mitigations.**

- Every authority row carries `max_uses` and is decremented atomically inside the same transaction that records the typed-data payload hash.
- Maintain a `signing_audit_log` keyed by `(authority_id, payload_hash)` with a unique constraint to make replay impossible at the DB layer.
- For `register_personal_server`, the typed data must include the PS's public key hash and an account-side server-issued nonce, and the authority must constrain the allowed PS URL.

---

## 3. HIGH — `signature_challenges` susceptible to fixation and cross-user binding bugs

Plan §5.7 names a `/api/signing/challenges/[id]` route. Three concrete risks:

**3a. Challenge fixation.** If the route accepts an `id` from the client and creates a row keyed by it, an attacker can pre-create challenge ID `X` bound to _attacker's_ `(vana_user_id, purpose)`, lure the victim into a flow that consumes ID `X`, and harvest the victim's signature against attacker-chosen typed data.

_Mitigation:_ server **always** generates the id (≥128 bits, `crypto.randomUUID()` or `randomBytes(16).toString("hex")`); never accept client-supplied IDs.

**3b. Replay / double-consumption.** The plan says "marks consumed" but does not specify the consumption guard. Without `UPDATE … WHERE consumed_at IS NULL RETURNING *`, two concurrent POSTs can both succeed.

_Mitigation:_ atomic transition `pending → consumed` via single `UPDATE` with `WHERE consumed_at IS NULL`; treat zero rows as "already consumed."

**3c. Cross-user binding.** The plan says challenges are tied to `(vana_user_id, vana_wallet_id, purpose)` but does not say the **consumer** is verified against the same session. Without that check, user A can create challenge X, user B can consume it (signing for A's wallet via B's UI). The recovered EOA address must match `vana_linked_wallets[vana_wallet_id].address`, AND the consuming session must equal the creating session's `vana_user_id`.

_Mitigation:_ on POST: `assert challenge.vana_user_id === session.vanaUserId && recoverAddress(typedData, signature) === expected_wallet_address`. Reject otherwise.

**3d. Enumeration.** Plan does not specify entropy. Use ≥128 bits cryptographically random.

---

## 4. HIGH — Vana session JWT verifier is underspecified; alg confusion + audience confusion are easy to ship

Plan §3.1 (`00-execution-plan.md:110`) says "Verifies as a JWT signed by Hydra." Hydra issues opaque access tokens by default; configuring JWT access tokens requires explicit settings and a JWKS endpoint. Without spec:

**4a. Algorithm pinning.** Verifier must hard-fail unless `alg ∈ {RS256, ES256}` (whatever Hydra is configured for). A `none` or HS256 confusion attack is trivial against permissive verifiers like older `jsonwebtoken` defaults.

**4b. Audience.** Hydra issues access tokens with `aud` set per OAuth client. The verifier must check `aud` includes `account.vana.org` (or whatever value account routes are scoped to). A token issued for `data-connect` audience must not authorize `account.vana.org` admin routes.

**4c. Issuer.** Verifier must pin `iss === HYDRA_PUBLIC_URL`.

**4d. JWKS rotation.** Cache JWKS with TTL, refresh on `kid` miss, never blindly fetch on every request (DoS on Hydra).

**4e. `nbf`/`exp` skew.** ±60 s clock skew acceptable; reject otherwise.

**4f. Subject shape.** `sub` must match `isVanaUserId(...)` per `hydra-admin.ts:256-260`.

**Mitigation.** Use `jose` with explicit `algorithms`, `audience`, `issuer`, `clockTolerance`. Document the verifier contract in `01-architecture.md` §1.4. Add a property-based test that asserts every malformed/wrong-aud/wrong-alg/wrong-iss token is rejected.

---

## 5. HIGH — 15-minute access-token TTL means revocation lag of up to 15 minutes for grant minting

Plan §3.2: 15 min access, 30 day refresh. Revocation lag of 15 min is too long for grant minting (the high-value op). A user who clicks "log out" or "revoke session" can still have grants minted on their behalf for 15 minutes from a stolen access token.

**Mitigation.**

- For high-risk purposes (`create_grant`, `register_personal_server`, anything in `signing_authorizations` with monetary or data-exfil impact), the route handler should additionally call Hydra's introspection endpoint (`/oauth2/introspect`) which checks live revocation. Cache introspection results for ≤30 s.
- Separately: store a `session_id` claim in the access token; on revocation, write a tombstone in Redis/Postgres; verifier checks tombstone; tombstone TTL = max access-token TTL.

---

## 6. HIGH — Refresh token storage is not specified

Plan §3.3: "set HttpOnly cookie `vana_session=<access>` (also store refresh server-side, keyed to session)." Where? In what table? Encrypted at rest with what key?

**Threat.** Refresh tokens are 30-day bearer credentials. If stored plaintext in Postgres and the DB is compromised (SQLi, backup leak), every active user's session is recoverable for 30 days. Worse if stored alongside `PRIVY_SIGNER_PRIVATE_KEY`-controlled state.

**Mitigations.**

- Encrypt refresh tokens at rest with a KMS-backed key (envelope encryption). The encryption key must NOT be the same as `PRIVY_SIGNER_PRIVATE_KEY`.
- Bind refresh token to session record; on use, rotate (refresh-token rotation per RFC 6749 §6).
- Detect reuse: if a previously-rotated refresh token is presented, revoke the entire session family.
- Do not log refresh tokens; redact in error paths.

---

## 7. HIGH — Dual cookie + Bearer transport on same routes is a CSRF surface

Plan §3.1: "accepts both cookie and Bearer transport." This is the classic mistake. Cookie auth is CSRF-vulnerable; mitigations diverge by transport.

**Threat.** Browser auto-sends `vana_session` cookie. A malicious site `evil.com` POSTs to `account.vana.org/api/sign` with a forged body. Without CSRF defense, the request is authenticated.

**Mitigations (defense in depth, do all):**

1. `SameSite=Lax` minimum; **prefer `Strict` for `vana_session`**. Note: `Lax` does not protect top-level GET → state change, so combine with #2.
2. Reject state-changing requests (POST/PUT/DELETE) when `Sec-Fetch-Site` is `cross-site` AND auth came from cookie. Allow when auth came from `Authorization: Bearer` (browsers don't auto-attach Bearer).
3. CSRF token bound to session for cookie-auth POSTs; not required for Bearer-auth POSTs.
4. Strict CORS: today `src/app/api/sign/route.ts:25-29` sets `Access-Control-Allow-Origin: *` with explicit `POST` method. With cookies this is a footgun. The plan must drop wildcard CORS on session-cookie routes; allowlist exact origins (`account.vana.org`, `data-connect.vana.org`, `connect.vana.org`).

**Cite.** `src/app/api/sign/route.ts:25-33` is the current CORS surface. The redesign inherits it unless explicitly fixed.

---

## 8. MEDIUM — Provider Containment Invariant CI grep is bypassable

Plan §1 and §1.9 commit to a CI grep that ensures Privy DIDs / provider IDs do not appear outside whitelisted paths.

**Threat.** Grep matches literal source bytes. It will not catch:

- Template literals: `` `did:${kind}:${id}` `` constructing a Privy DID dynamically.
- Variable indirection: `const k = "privy"; obj[k + "Sub"]`.
- Indirect property access: `obj["privy" + "Sub"]`.
- JSON serialization of an object whose key is `privy_sub` produced via `Object.fromEntries`.
- Imports re-exported under generic names (`identifier` from a provider module).
- Future provider names (Para, Dynamic) — grep regex must be maintained.
- Source-mapped or generated code outputs.

**Mitigations.**

- Treat grep as one signal in defense-in-depth. Add:
  - **Type-level enforcement**: a branded `VanaUserId` type and `ProviderSubject` type that never narrows to each other; runtime predicate `isVanaUserId` (already in `hydra-admin.ts:256`) used at every emit point.
  - **AST-based lint** (eslint custom rule): forbid string concatenation that could yield a DID prefix; forbid imports of provider SDKs outside `wallet-providers/*`.
  - **Schema-level enforcement**: DB columns named `vana_user_id` only; no `privy_sub`/`provider_user_id` outside the `auth_provider_links` adapter table.
  - **Runtime tripwire**: middleware that scans response bodies in dev/staging for `did:privy:*` patterns, fails the request loudly.

---

## 9. CRITICAL — `/api/auth/session` Privy bridge: any valid Privy id_token mints a Vana session

Plan §4.3 (`00-execution-plan.md:126`): the bridge route accepts a Privy id_token and mints a Vana session. The trust boundary is: account.vana.org trusts that Privy's verification of an id_token implies the bearer controls the embedded wallet referenced inside.

**Threat.** Any valid Privy id_token from _any_ user, presented to `/api/auth/session`, will be verified by `verifyIdentityToken(...)` (`login-session-adapter.ts:208`) and mapped to that user's `vana_user_id`. So:

- A malicious app that has its own Privy integration and obtains a user's id_token can replay it to account.vana.org and mint a Vana session for that user.
- Privy id_tokens are typically _not_ audience-bound to a specific app the way OIDC `aud` is; if they are JWTs, the `aud` claim is the Privy app id. Different Privy apps issue different `aud`s — but if account.vana.org's verifier accepts any audience, cross-app token replay works.

**Mitigations.**

- Pin the verifier to **only** the account.vana.org Privy app id (`aud === PRIVY_APP_ID`). `verifyIdentityToken` from `@privy-io/node` configured with the right app secret should already enforce this, but assert it explicitly with a unit test that rejects a token from a different app id.
- Bind the bridge to a server-issued nonce: the client first calls `POST /api/auth/session/begin` → gets a nonce; submits id_token with the nonce; verifier checks Privy id_token includes that nonce in `nonce` claim. Privy supports passing a nonce to login.
- Rate-limit `/api/auth/session` per IP/UA; alert on burst.
- The bridge must reject id_tokens older than ~5 min (`iat` skew).

---

## 10. HIGH — OAuth2 device flow on `account.vana.org` is phishable + needs hardened polling and code lifetime

Plan §3.4, §7.5.

**10a. Phishing.** Attacker initiates a device flow from his own machine, obtains a `user_code`, social-engineers a victim into typing the code at `account.vana.org/oauth/device` while logged in. Victim approves; attacker's device now has a Vana session for the victim.

_Mitigation:_ the approval screen must **prominently** display the requesting client name, scopes, and a warning ("only approve if you initiated this from your own device"). Require 2-step confirmation: enter code → review → click Approve. Display the _origin_ of the device that initiated the request when known. Consider asking the user to enter the user_code, then displaying a high-entropy _visual fingerprint_ (color/word) the requesting device shows — only matching fingerprints proceed.

**10b. Polling.** Per RFC 8628, server MUST enforce `interval` (default 5 s) and respond `slow_down` if violated. The plan does not specify. Add per-`device_code` rate limit.

**10c. Code lifetime.** Default 5–15 min. The plan does not specify. 10 min is a reasonable target. Single use; expire on success or denial.

**10d. user_code entropy.** ≥6 chars, uppercase letters minus ambiguous (no `O`/`0`/`I`/`1`). Rate-limit guesses per IP.

**10e. Refresh-token issuance to public clients.** Native clients are public; the device flow grant should still issue refresh tokens — but ensure no client_secret is required (per RFC 8628 §3.5) and refresh tokens are bound to the device_code session, not just the user.

---

## 11. MEDIUM — `wallet.signTypedData` for user EOAs needs UI clarity to prevent malicious typed-data injection

The challenge flow returns typed data to the client; the user's wallet UI displays it. EIP-712 typed data is structured but a malicious server could inject typed data whose `domain.name` says "Vana Personal Server" while the `message` actually authorizes a token transfer or grants data to an attacker-controlled grantee.

**Mitigation.**

- Closed `purpose` enum drives a **closed set of typed-data shapes**, validated against EIP-712 schema before display (plan §5.1 — make schema enforcement strict).
- The Connect UI surrounding the wallet popup must show a human-readable summary of _what is being signed_ (purpose, grantee, scope) BEFORE the user opens the wallet.
- Domain separator pinning: `domain.verifyingContract` and `domain.chainId` are part of the authority constraint; reject if mismatched.
- Server validates the typed data passed back to it on consumption matches the typed data it issued (hash compare against `signature_challenges.typed_data_hash`), so the client cannot swap payloads mid-flight.

---

## 12. CRITICAL — `PRIVY_SIGNER_PRIVATE_KEY` blast radius is "every user's embedded wallet"

`src/app/api/sign/route.ts:83` reads `PRIVY_SIGNER_PRIVATE_KEY` and passes it as `authorization_private_keys` to Privy. Privy's authorization-key model means this single key, when paired with allowlisted purposes, can sign on behalf of **any** Privy embedded wallet in the app whose owner has an active session (and, with the redesign's auto-authorities, that's all of them).

**Threat.** A leak of `PRIVY_SIGNER_PRIVATE_KEY` (env exfil, runtime memory dump, log line, exposed Vercel preview env, broken `.env` commit) lets the attacker — combined with a victim's `vana_session` — mint signatures for any user's embedded wallet for any allowlisted purpose. With the redesign's grant minting, this means data exfil from every user's PS.

**Mitigations.**

- Move `PRIVY_SIGNER_PRIVATE_KEY` into a KMS-backed signer (HSM, AWS KMS asymmetric, or Privy's own custody-as-a-service if available). The Node process should never see the raw key; it asks KMS to sign.
- Rotate key on a fixed schedule (90 days) and on any incident.
- Restrict env access: prod `PRIVY_SIGNER_PRIVATE_KEY` available only to the production runtime, not preview deploys; never to local dev.
- Telemetry: per-key-usage audit log, alert on unusual signing rate.
- Verify Privy supports `authorization_signature` mode where the auth signature comes from a remote signer (KMS) rather than a local private key. If not, raise with Privy.
- Defense in depth: the `signing_authorizations` row must be required at the route layer even if someone exfils the key — the key alone shouldn't be sufficient if the route checks the DB. But Privy's API will sign for anyone holding the key, so the DB check is your only barrier.

---

## 13. MEDIUM — `register-builder.ts` server-generated EOA persists as an "anomaly resolution"

Plan §6.2 says the server-generated EOA "continues to exist (it's the builder's identity, not the user's wallet)." This is a back-channel custody pattern — the server holds a private key for a builder. Where is it stored? Encrypted? Rotatable? Auditable? If leaked, the builder's identity is forge-able and any signed registration looks legitimate.

**Mitigation.** Same as §12: KMS, audit log, rotation. Document the threat model in `01-architecture.md`. The "rename to clarify" is cosmetic — the security boundary is what matters.

---

## 14. LOW — Error responses leak Privy internals

`src/app/api/sign/route.ts:118-122` returns the underlying error message verbatim ("non-secret operational data" per the comment). This includes Privy's internal error messages, which can hint at the user's wallet existence, account state, and sometimes wallet IDs.

**Mitigation.** Return generic 4xx/5xx in production; log full error server-side. The redesigned `wallet.signTypedData` should follow the same contract.

---

## 15. INFO — Logout must atomically revoke all session-bound state

Plan §3.6, §5.5. Logout must (transactionally):

1. Revoke refresh token at Hydra (`/oauth2/revoke`).
2. Delete server-side refresh token row.
3. Revoke / mark-expired all `signing_authorizations` for this `(vana_user_id, vana_session_id)`.
4. Clear cookie with `Max-Age=0`, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict`.
5. Add session_id to a 15-min tombstone set so already-issued access tokens stop working.

If any step fails, retry with idempotency. Log failures loudly.

---

## Summary table

| #   | Severity | Issue                                                                 |
| --- | -------- | --------------------------------------------------------------------- |
| 1   | CRITICAL | Auto-issued authorities turn cookie theft into wallet compromise      |
| 2   | CRITICAL | Authority replay → multiple PS registrations                          |
| 3   | HIGH     | Challenge fixation / replay / cross-user binding                      |
| 4   | HIGH     | JWT verifier not specified (alg/aud/iss/JWKS)                         |
| 5   | HIGH     | 15-min revocation lag for grant minting                               |
| 6   | HIGH     | Refresh-token storage spec missing                                    |
| 7   | HIGH     | Dual transport CSRF surface; wildcard CORS                            |
| 8   | MEDIUM   | Grep-based PCI enforcement is bypassable                              |
| 9   | CRITICAL | Privy id_token bridge accepts cross-app tokens unless audience pinned |
| 10  | HIGH     | Device flow phishable; polling/code-lifetime unspecified              |
| 11  | MEDIUM   | EIP-712 typed-data injection without UI summary                       |
| 12  | CRITICAL | `PRIVY_SIGNER_PRIVATE_KEY` blast radius is all users                  |
| 13  | MEDIUM   | Builder EOA custody under-specified                                   |
| 14  | LOW      | Error responses leak Privy internals                                  |
| 15  | INFO     | Logout must atomically revoke all session-bound state                 |

---

## Recommended top-of-funnel changes for `01-architecture.md`

1. Make `create_grant` always interactive (challenge), never auto-authority. **Non-negotiable.**
2. Specify JWT verifier with explicit `algorithms`, `issuer`, `audience`, `clockTolerance`, JWKS cache TTL.
3. Move `PRIVY_SIGNER_PRIVATE_KEY` to KMS before stage 5 lands.
4. Spell out `signing_authorizations` shape: `(id, vana_user_id, vana_session_id, vana_wallet_id, purpose, payload_constraints jsonb, max_uses int, used_count int, expires_at, revoked_at)`. Atomic decrement on use.
5. Spell out `signature_challenges` shape: `(id PK, vana_user_id, vana_wallet_id, purpose, typed_data jsonb, typed_data_hash, expected_signer, created_at, expires_at, consumed_at, consumed_signature)`. Server-generated id only.
6. CSRF: `SameSite=Strict`, drop wildcard CORS, add `Sec-Fetch-Site` check on cookie-auth POSTs.
7. Bind device flow approval to a 2-step UI with prominent client name/scope display.
8. Add a runtime tripwire (dev/staging) that scans all response bodies for `did:privy:` and fails loud.
