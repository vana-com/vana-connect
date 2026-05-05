# Security Audit v2 — Auth & Custody Redesign Execution Plan (revised)

Audit target: `docs/auth-redesign/00-execution-plan.md` v2 (post-critique-1).
Reviewer mode: adversarial. Verifies round-1 findings; flags new holes introduced by the revision.

---

## Round-1 findings — disposition in v2

**#1 CRITICAL (auto-issued authorities) — RESOLVED.** §1.5, §5.5 explicitly state "no auto-issuance" and "single-use, payload-bound, expires 60s." §5.2 binds authority to `payload_hash` and atomically increments `used_count` with `max_uses=1`. High-risk purposes (`create_grant`, `register_personal_server`) require `interactive_confirmations` per §1.5/§1.6. **Sufficient**, contingent on the §1.2 DDL actually expressing `(max_uses=1, payload_hash NOT NULL, expires_at NOT NULL DEFAULT now()+60s, UNIQUE(payload_hash))` and the Stage 5.2 transaction wrapping the Privy SDK call inside the same DB tx that decrements `used_count`. If the row is written _after_ the SDK call (TOCTOU), replay reopens. **Action:** §1.2 must show the exact DDL and the call-site SQL ordering.

**#2 CRITICAL (replay) — MOSTLY RESOLVED.** `max_uses=1` + `payload_hash` binding + atomic decrement closes per-authority replay. Gap: the plan does not require a `UNIQUE(payload_hash)` constraint _across_ authorities — so an attacker with confirmation_id reuse could mint two authorities for the same payload. Combined with the confirmation TTL of 60s, narrow but real. **Action:** add `UNIQUE(payload_hash) WHERE used_count = 0` partial index, OR a `signing_audit_log` with unique `payload_hash`. Without this, finding #2 is only HIGH-mitigated, not closed.

**#3 HIGH (challenge fixation) — DEFERRED CORRECTLY.** §1.5 returns `{ kind: "not_supported_yet" }` for user EOAs. This is a structured negative response, not a leak — it does not disclose whether the wallet exists, whether the user has linked one, or any provider state. Equivalent response for any vana_user_id with no provider_embedded wallet. **Sufficient.** Caveat: ensure the response shape is identical for "wallet not found", "wallet is user_controlled_eoa", and "feature off" so timing/shape don't differentiate.

**#4 HIGH (JWT verifier) — RESOLVED, with caveat.** §1.4 + §3.9 spell out opaque + introspection with `iss`, `aud`, `exp`, `clockTolerance: 60`. **New attack surface**: the introspection endpoint `/admin/oauth2/introspect` is admin-scoped on Hydra; account.vana.org needs Hydra admin credentials in env. If `HYDRA_ADMIN_URL` leaks or the admin credential is stolen, the attacker can introspect _and_ mint tokens (admin can `acceptLoginRequest` for any subject). **Action:** §3.2 setup script must split admin vs. introspection scopes if Hydra supports it; otherwise document the admin-credential blast radius alongside `PRIVY_SIGNER_PRIVATE_KEY`.

**#5 HIGH (revocation lag) — PARTIALLY RESOLVED.** 30s cache + tombstone reduces lag from 15min to 30s. See concerns (b) and (c) below — in-process cache across multiple Vercel lambdas means tombstone propagation is not actually 30s, it's 30s _per-instance independently_. For the high-risk `create_grant`/`register_personal_server` paths the `interactive_confirmations` requirement closes the window (a stolen access token still cannot mint without a fresh confirmation). For lower-risk routes 30s is acceptable. **Sufficient for high-risk; document the multi-instance reality.**

**#6 HIGH (refresh-token storage) — UNDERSPECIFIED.** §3.10 says "encrypted-at-rest in `vana_refresh_tokens`" but does not name the KEK. If the KEK is an env var (`REFRESH_TOKEN_ENC_KEY`) sitting next to `PRIVY_SIGNER_PRIVATE_KEY` in Vercel envs, encryption-at-rest only defends against DB-only compromise (SQLi, backup leak) — not against runtime exfil. **Action:** §1.2 / §2.1 must specify (a) KEK source (Vercel env vs. KMS), (b) algorithm (AES-256-GCM with per-row IV), (c) that the KEK is distinct from `PRIVY_SIGNER_PRIVATE_KEY`. Until specified this remains HIGH.

**#7 HIGH (CSRF / wildcard CORS) — RESOLVED.** §3.7 double-submit (`vana_session` HttpOnly + `vana_csrf` JS-readable, header `x-vana-csrf` matches cookie) is the correct pattern. State-mutating routes Bearer-only OR cookie+CSRF per §1.4. **Sufficient.** Verify §3.7 also drops the existing wildcard `Access-Control-Allow-Origin: *` from `/api/sign` and successors — round-1 cite at `src/app/api/sign/route.ts:25-29` is not explicitly addressed in v2; §5.6 deletes the route entirely, which closes it.

**#8 MEDIUM (PCI grep) — RESOLVED.** §1.9, §6.1, §6.2 replace grep with branded types + runtime tripwire. Stronger.

**#9 CRITICAL (Privy bridge replay) — RESOLVED.** §3.10 nonce mechanism (server-issued 16-byte nonce, 5min TTL row, returned to client, embedded in Privy login, validated on submit) is a correct CSRF-style anti-replay. **Not** a session-fixation footgun _if_ (a) the nonce row is keyed by a server-generated id (not client-supplied), (b) consumed atomically, (c) bound to the resulting `vana_session_id`. §3.10 says "stored in 5min TTL row" — must say "server-generated id, single-use, deleted on consume." **Action:** clarify the same 3 hardening rules from round-1 #3 (server-only id, atomic consume, session binding).

**#12 CRITICAL (`PRIVY_SIGNER_PRIVATE_KEY`) — EXPLICITLY DEFERRED.** §"Out of scope", risk register, and `security-debt.md` placeholder acknowledge the debt. **Is it safe to ship v2 with this outstanding?** Yes, conditionally. The signing-authority plane is the new control: even with the key, the attacker still needs a valid `signing_authorization` row, which now requires confirmation + payload binding + 60s TTL. Key compromise shifts from "every user, any payload" to "every user, only payloads the attacker can also drive a confirmation flow for from a stolen session." That is materially smaller. **Caveat:** the runtime memory dump threat — code on the same Node process as the signer can construct authorities directly via DB writes. The key itself remaining in process memory means a malicious Node-level attacker bypasses everything. Document the residual risk; ship.

---

## NEW concerns introduced by the revision

**a. CRITICAL — `interactive_confirmations` payload summary tampering.** §1.6 has the route generate the summary the user clicks Confirm on. If the route has a bug that omits a field (e.g., grant `scope` collapses to default), the user sees a partial summary, signs off, and the authority is issued for the actual full payload. The `confirmation_id` binds to the authority's `payload_hash`, but the _summary the user saw_ is not part of the hash. **Mitigation:** store the displayed summary verbatim in `interactive_confirmations.payload_summary`; the route must derive the summary from the _same_ serialized payload that produces `payload_hash`, and the typed-data validator (per §5.1) must reject any payload with fields the summary template does not cover. Add a property test: every field in the typed data appears in the summary or the route fails closed.

**b. MEDIUM — In-process introspection cache across Vercel lambdas.** §1.4 cache is per-lambda. With N concurrent lambdas, revocation propagation is up to 30s per-instance independently, but a refresh hits a _cold_ cache so it round-trips Hydra and sees the live state — so worst case is 30s, not 30s × N. **Acceptable for low-risk routes; for high-risk routes, the `interactive_confirmations` requirement is the actual gate.** Document: "introspection cache is best-effort; do not rely on it for security-critical revocation."

**c. HIGH — Tombstone propagation across lambdas.** §3.6 says "adds session_id to a 15min tombstone (in `getVanaSession` introspection cache, marks session inactive)." If the tombstone is in-process, lambda A logs the user out, lambda B serves the next request with a still-valid cached introspection result, and the user remains authenticated for up to 30s on lambda B. **For high-risk routes**, confirmation requirement gates this. **For low-risk routes** (account read), 30s lag is acceptable. **Action:** §3.6 must clarify tombstone storage — recommend Postgres row (`vana_session_tombstones`) checked on every introspection cache hit, OR Redis/Upstash. In-process tombstone alone is insufficient.

**d. HIGH — `/api/auth/session` still calls `privyClient.users().get()`.** §5.3 carves out the bridge route as the only place outside the adapter. id_token replay defense lives in §3.10 (nonce) + §3.3 (audience pin, iat skew). **Sufficient if** (1) `aud === PRIVY_APP_ID` is explicitly asserted (not just `verifyIdentityToken` defaults — assert in code with a unit test that rejects a token from a different Privy app), (2) the nonce is consumed atomically, (3) `iat` skew is ≤5min as stated. The route does not authenticate against an existing Vana session, so cross-session abuse N/A. **Acceptable.**

**e. HIGH — Logout transactionality.** §3.6 lists 4 steps: revoke refresh + Hydra end-session + tombstone + clear cookie. Not transactional. If Hydra revoke succeeds and tombstone write fails, the session continues to authenticate for 30s. **Mitigation:** order steps (1) write tombstone _first_ (DB row, not in-process), (2) clear cookie, (3) revoke refresh at Hydra (best-effort), (4) end-session at Hydra (best-effort). Tombstone-first means the failure mode is "Hydra still has a session record, but our verifier rejects it" — fail-closed. Steps 3-4 retried via background job. **Action:** §3.6 must spec the ordering and the retry mechanism.

---

## Confidence assessment

**Overall: MEDIUM-HIGH confidence in v2.**

Round-1 critical findings #1, #2 (mostly), #4, #9 are addressed at the design level. #12 is a known, acceptable debt given the new authority plane. #5/#6/#7 mitigations need concrete spec in §1.2/§2.1/§3.7.

**Pre-Stage-2 blockers (must resolve in §1):**

- (a) summary tamper-proofing tied to payload_hash
- (c) tombstone moved out of in-process cache
- (e) logout step ordering
- §1.2 DDL explicit: `payload_hash NOT NULL`, partial UNIQUE, KEK source, KEK ≠ Privy key

**Pre-Stage-5 blockers:**

- §3.10 nonce hardening rules (server-only id, atomic consume, session binding)
- §3.3 unit test asserting `aud === PRIVY_APP_ID` rejection of foreign-app tokens

**Acceptable to defer:**

- KMS migration of `PRIVY_SIGNER_PRIVATE_KEY` (debt documented)
- `signature_challenges` table (no current EOA flow)

Ship v2 after the four Stage-1 blockers and two Stage-3 hardening items above are folded into `01-architecture.md`. The signing-authority plane is the right architectural shift; the remaining work is making the DDL and the call-site code match the design intent.
