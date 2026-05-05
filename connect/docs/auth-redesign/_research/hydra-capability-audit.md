# Hydra Capability Audit (vs. 00-execution-plan.md)

Author: claude (under Tim's direction)
Last updated: 2026-05-04
Live deployment probed: `https://oauth-dev.vana.org`

## Live deployment

- Issuer: `https://oauth-dev.vana.org` (public OIDC discovery returns 200)
- Admin URL (Cloud Run): `https://oauth-hydra-admin-development-*.run.app`, IAM-gated; reached via Google ID-token Bearer (matches `hydra-admin.ts:fetchGoogleIdTokenForAudience`).
- Version endpoint: not exposed publicly (404 on `/version`). Discovery shape (presence of `device_authorization_endpoint`, `credentials_endpoint_draft_00`, `backchannel_logout_supported`, `claims_parameter_supported`) is consistent with **Hydra v2.2.x or v2.3.x**. v2.2.0 introduced device flow + verifiable credentials draft.
- Public discovery confirms: `authorization_code`, `client_credentials`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`. Includes `revocation_endpoint`, `end_session_endpoint`, JWKS at `/.well-known/jwks.json` (two RS256 keys present — rotation working).
- `claims_supported: ["sub"]` only. Cosmetic, but worth knowing: Hydra advertises only `sub`; custom claims still work, just not advertised in metadata.

## Capabilities checklist

### 1. Refresh-token grant — CONFIRMED

- Per-client: include `"refresh_token"` in `grant_types` and request `offline_access` (or `offline`) scope. Live discovery already exposes `offline_access` and `offline`.
- Lifetimes: configurable globally via `ttl.refresh_token` (and `ttl.access_token`, `ttl.id_token`) and per-client via `PUT /admin/clients/{id}/lifespans` with grant-specific keys (`authorization_code_grant_access_token_lifespan`, `authorization_code_grant_refresh_token_lifespan`, `refresh_token_grant_access_token_lifespan`, `refresh_token_grant_refresh_token_lifespan`).
- Plan asks for 15 min access / 30 days refresh — both are achievable per-client. Plan section 3.2: confirmed.
- Source: https://www.ory.sh/docs/hydra/reference/configuration; OAuth2ClientTokenLifespans (hydra-client-go docs).

### 2. Token revocation (`/oauth2/revoke`) — CONFIRMED

- Standard RFC 7009 endpoint at `/oauth2/revoke`. Confirmed live in our discovery doc.
- Revoking a refresh token **immediately invalidates the linked access token** (Hydra explicitly documents this; for opaque tokens, the introspection store is updated; the next introspection returns `active: false`).
- Caveat: with **JWT access tokens**, revocation does **not** invalidate the JWT signature. Stateless verifiers (local JWKS verification) will keep accepting it until `exp`. To enforce immediate revocation under JWT-mode you must call `/oauth2/introspect` (which checks the revocation list) — but that defeats the local-JWT performance benefit.
- Plan section 3.6 (logout revokes refresh token) and Stage 6/Stage 1 implications: with the plan's 15-min access TTL this is a controlled exposure window. **Flag for 01-architecture: explicitly state the "revoked-but-still-valid-for-≤15-min" property** if JWT access tokens are chosen.
- Source: https://www.ory.sh/docs/hydra/reference/api#tag/oAuth2/operation/revokeOAuth2Token

### 3. Token introspection — CONFIRMED, NOT RECOMMENDED for hot path

- `POST /admin/oauth2/introspect` (admin port) accepts both access and refresh tokens, returns RFC 7662 fields (`active`, `sub`, `client_id`, `scope`, `aud`, `exp`, `iat`, `token_type`, `token_use`, plus the `ext: {...}` claim bag from the consent session).
- Performance: single DB lookup per call. Hydra benchmarks suggest sub-10 ms intra-region latency, but it is a synchronous network round-trip from the verifier. Per-request introspection on every authenticated route would add 23×N RTTs to account.vana.org cold paths.
- Recommendation: **don't use introspection in `getVanaSession()`**. Use local JWT verification against `/.well-known/jwks.json` with a cached JWKS. Keep introspection as a tool for the Personal Server's gateway-style token check at session-bootstrap time only, or for opaque-token mode.
- Source: https://www.ory.sh/docs/hydra/reference/api#tag/oAuth2/operation/introspectOAuth2Token

### 4. JWT vs opaque access tokens — CONFIRMED with caveats

- Hydra default is **opaque** (`ory_at_...`). To get JWT access tokens, set globally `strategies.access_token: jwt` in Hydra config, or per-client via `access_token_strategy: "jwt"` on the OAuth2 client object. The OpenAPI doc explicitly notes "Using `jwt` is generally not recommended" — this is Ory's blanket caution about non-revocable bearer tokens.
- For our use case (verifier on every account.vana.org route, plus PS gateway), JWT is the right choice. Tradeoffs:
  - Pro: stateless verification via cached JWKS, no admin-port dependency, sub-millisecond verify.
  - Con: revocation is not instant (see #2). Mitigation: short access TTL (the plan's 15 min is reasonable; consider 5 min for tighter blast radius).
- JWT format gotcha: when the JWT strategy is enabled, custom claims set in `session.access_token` are **wrapped in an `ext: {}` claim**, not flattened to top-level. Verifier must read `payload.ext.vana_user_id`, not `payload.vana_user_id`. The `sub` claim is at top level.
- Source: OAuth2Client.AccessTokenStrategy (hydra-client-go); UPGRADE.md "JSON Web Token formatted Access Token data".

### 5. Custom claims on access tokens — CONFIRMED

- `acceptOAuth2ConsentRequest` accepts a `session` object with two keys: `access_token` (custom claims for both access and refresh; visible in introspection or in JWT `ext`) and `id_token` (visible to anyone who can decode the ID token).
- Today our `buildHydraSessionClaims()` only writes to `id_token` — `vana_user_id`, `email`, `linked_wallets` end up on the ID token, not the access token. **For the plan's "every route reads `vana_user_id` from the access token" model, we must add an `access_token` session bag** mirroring the relevant claims (at minimum `vana_user_id`).
- Note: `sub` already carries `vana_user_id` (we set `subject = vanaUserId` in `acceptLoginRequest`). For minimum viable verifier we don't strictly need a custom claim — `getVanaSession()` can read `payload.sub`. But if we want to carry `linked_wallets` or roles for downstream use, they need to be in `session.access_token`.
- **Plan section 3.3 / 5.x recommendation: store `vana_user_id` only as `sub` in v1; treat additional claims as a follow-up.**
- Source: AcceptOAuth2ConsentRequestSession (hydra-client-go docs).

### 6. Audience handling — CONFIRMED

- Per consent: `grant_access_token_audience: string[]` set on `acceptOAuth2ConsentRequest`. Multi-audience supported. Live code already reads `requested_access_token_audience` from the consent request and forwards it.
- Per client: `audience: string[]` on the OAuth2 client object whitelists what audiences a client may request.
- Plan use case: data-connect device-flow client requests audience like `["account.vana.org", "https://ps.<user>.vana.org"]`. Set `audience` on that client; pass through during consent.
- Source: OAuth2Client (audience field) and OAuth2ConsentSession (grant_access_token_audience).

### 7. Device authorization grant (RFC 8628) — CONFIRMED

- Native support added in Hydra v2.2 (March 2024). Live discovery exposes `device_authorization_endpoint: https://oauth-dev.vana.org/oauth2/device/auth`. **No need to implement device-flow endpoints on account.vana.org as separate routes** — Hydra issues the device codes and polls. account.vana.org only needs:
  - A device-verification UI page (where the user enters/confirms the user code) — this is the consent UI flow, which is already partially wired (`/auth/oidc/login`, `/auth/oidc/consent`).
  - Admin call: `acceptDeviceUserCodeRequest` (alongside accept-login/accept-consent).
- Client config: `grant_types` must include `urn:ietf:params:oauth:grant-type:device_code`. `token_endpoint_auth_method: "none"` is acceptable for public clients (data-connect). Audience can be set as #6 above.
- **Severity: MEDIUM revision to plan.** Stage 3.4 says "OAuth2 device-code flow endpoints on account.vana.org: `/oauth/device/authorize`, `/oauth/device/poll`, `/oauth/device/approve`". Hydra hosts `device/auth` and `token` itself; account.vana.org only needs the **device verification UI** (where the user types the code) and to wire `acceptDeviceUserCodeRequest` into the consent handler. The plan's three custom routes are unnecessary — rewrite as: "Reuse Hydra's native device endpoints; add `/auth/device` UI page that calls `getDeviceUserCodeRequest` + `acceptDeviceUserCodeRequest`".
- Source: https://www.ory.sh/docs/hydra/reference/api (operations: oAuth2DeviceFlow, getOAuth2LoginRequest, acceptUserCodeRequest).

### 8. OAuth client management — CONFIRMED

- `POST /admin/clients`, `GET /admin/clients/{id}`, `PUT /admin/clients/{id}`, `DELETE /admin/clients/{id}`. Listed and paginated.
- Minimal data-connect device-flow client config:
  ```json
  {
    "client_name": "data-connect",
    "grant_types": [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token"
    ],
    "scope": "openid offline",
    "audience": ["https://account.vana.org"],
    "token_endpoint_auth_method": "none",
    "access_token_strategy": "jwt"
  }
  ```
- Admin auth in our deployment: Google ID-token (Cloud Run IAM). Existing `hydra-admin.ts` already wires this. Adding a `createOAuth2Client()` call to `createHydraAdminClient()` is straightforward.
- Source: https://www.ory.sh/docs/hydra/reference/api (oAuth2 → createOAuth2Client).

### 9. Login & consent under refresh-token grant — CONFIRMED (silent)

- When a client exchanges a refresh token at `/oauth2/token`, Hydra **does not** invoke login or consent challenges. The refresh grant uses the originally-stored consent session.
- Constraints: the refresh-grant scope must be a subset of the originally-granted scope; if you've narrowed a client's allowed scopes, refresh fails. The refresh grant also runs Hydra's audience-change check.
- Plan section 3.7 (refresh test) and 5.4 (default authorizations on login): no impact. Refresh "just works" once the initial consent is in place. To re-prompt, callers must use `prompt=login` or `prompt=consent` on a fresh authorize call — refresh alone won't trigger them.
- Source: UPGRADE.md "Non-breaking Changes > Refresh Grant"; reference docs.

### 10. Session management on logout — CONFIRMED with JWT caveat

- `GET /oauth2/sessions/logout` is the OIDC RP-Initiated Logout endpoint. With `id_token_hint`, Hydra ends the **OIDC session** (kills the SSO cookie at Hydra) and triggers front-/back-channel logout to all RPs that registered logout URIs.
- Crucial detail: **logout does not by itself revoke access or refresh tokens.** It ends the SSO session so the next authorize will re-prompt. To revoke tokens, call `/oauth2/revoke` per token, or `DELETE /admin/oauth2/auth/sessions/login?subject=<sub>` (admin) which kills the login session and triggers back-channel logout.
- Plan section 3.6 says "revoke refresh token at Hydra, clear cookie, delete server-side refresh-token row" — that's correct. Add: also call `/oauth2/sessions/logout` (with id_token_hint) so the SSO session is killed; otherwise the next Privy login would silently re-issue a new session via Hydra without a fresh consent.
- For JWT access tokens: same caveat as #2 — the in-flight JWT survives until `exp` regardless of revocation.
- Source: https://www.ory.sh/docs/hydra/concepts/oauth2#oauth-20-and-openid-connect-logout; revokeOAuth2LoginSessions admin op.

### 11. Token format gotchas — confirmed

- **`ext` wrapper** for custom claims under JWT strategy (see #4). Verifier must read `claims.ext.vana_user_id`. Dev mistake risk: high — flag in `01-architecture` 1.7 (claim layout).
- **Audience is always an array** (since Hydra 1.0.0-beta.1), even single-audience. JWT verifier libraries that accept `aud: string` will need explicit array handling.
- **`sub` for `subject_types_supported: pairwise`**: pairwise is supported but disabled by default; current deployment advertises both `public` and `pairwise`. We use `public` (subject = vana_user_id directly). If we ever switch to pairwise, `sub` becomes a per-client opaque hash and the verifier breaks. Lock to `subject_type: public` per client.
- **Token prefix**: opaque tokens are `ory_at_...` / `ory_rt_...`. JWT tokens are bare JWTs (no prefix). If anything in our codebase pattern-matches token prefixes (it doesn't, last I checked) it'll break under JWT strategy.
- **`scopes_supported`** at the issuer level only advertises `openid`, `offline`, `offline_access`. Custom scopes (e.g. for PS-specific permissions) are not advertised in metadata but are accepted at runtime — this is normal Hydra behavior.

## Plan deltas (severity-tagged)

| #   | Plan section                                     | Issue                                                                                                                                                                     | Severity                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | 3.4 device-flow endpoints on account.vana.org    | Hydra hosts native RFC 8628 endpoints; only the verification UI is needed locally                                                                                         | MEDIUM (saves work)                                 |
| 2   | 3.1 verifier reads JWT from cookie/Bearer        | Plan implies plain JWT layout; under Hydra JWT strategy, custom claims are nested in `ext`                                                                                | LOW (one-line fix in verifier)                      |
| 3   | 3.6 logout = revoke refresh token + clear cookie | Add: also call `/oauth2/sessions/logout` to kill the SSO session at Hydra                                                                                                 | MEDIUM (silent re-login risk if missed)             |
| 4   | 3.2 access TTL 15 min, refresh 30 days           | OK. Note that under JWT strategy, revocation is `≤ access_TTL` deferred. Document explicitly                                                                              | LOW                                                 |
| 5   | 5.4 mint default authorizations on login         | Compatible with refresh grant (silent). No re-consent will fire. OK                                                                                                       | NONE                                                |
| 6   | 1.7 token format/claims                          | Specify: `sub = vana_user_id`; additional claims under `ext` (access) and top-level (id_token); aud is array                                                              | LOW (clarify spec)                                  |
| 7   | global                                           | Choose JWT vs opaque access tokens explicitly. Plan implies JWT ("verifies as a JWT signed by Hydra") — confirm and set `access_token_strategy: "jwt"` per client         | MEDIUM (config decision must be in 01-architecture) |
| 8   | 4.5 oauth_clients owner migration                | Existing `/api/admin/oauth-clients` likely calls `POST /admin/clients`. After ownership column rename, also confirm Hydra client `metadata` field is unused or repurposed | LOW                                                 |

## Bottom line

The plan is **viable as written, with two architectural clarifications and one scope reduction**:

1. **Set `access_token_strategy: "jwt"` per client and document the `ext.{}` claim envelope.** This is the single most important config bit and is glossed over in the plan.
2. **Drop the custom device-flow routes** (`/oauth/device/authorize`, `/oauth/device/poll`, `/oauth/device/approve`). Use Hydra's native endpoints; build only the verification UI.
3. **Logout = revoke + end-session.** Both calls, not just revoke.

Everything else the plan assumes — refresh grant, revocation, custom claims, audience, programmatic client creation, silent refresh — is supported on the Hydra version we already run.
</content>
</invoke>
