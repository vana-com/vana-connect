# 01 — Architecture: Hydra integration

Status: draft
Author: claude (under Tim's direction)
Last updated: 2026-05-04

This document is the Hydra-specific slice of `01-architecture.md`. It specifies the OAuth client topology, token lifecycle, device-flow integration, logout sequencing, introspection proxy, and bootstrap script. It assumes the v3 plan in `00-execution-plan.md` (sections 1.4, 1.7, 1.8, 1.11). Where the plan and the Hydra capability audit (`_research/hydra-capability-audit.md`) disagree, the audit wins on capability questions; the plan wins on policy.

Decisions locked here:

- **Access tokens are opaque.** `access_token_strategy: "opaque"` on every client. We pay one `~10ms` introspection per route invocation (cached 30s per-lambda), and gain real revocation. This deviates from the audit's preferred recommendation (#3) and is intentional: revocation correctness matters more than verifier latency for our threat model.
- **`sub = vana_user_id` everywhere.** Custom claims (e.g. `linked_wallets`, `email`) live in the consent `session.id_token` bag (existing `buildHydraSessionClaims` in `src/lib/auth/hydra-admin.ts:230`). For the verifier, `sub` is enough; richer claims are read from the introspection response's `ext` field if/when we add them to `session.access_token`.
- **One audience strategy.** A device-flow token's `aud` includes `account.vana.org` and `vana-personal-server`. PS validates the token's `aud` includes the literal string `vana-personal-server`; per-PS URL pinning is enforced by PS comparing the introspected `sub` against its configured owner. This sidesteps the wildcard-audience question (see §6).

---

## 1. Hydra OAuth clients

Three clients. The first two already partially exist in dev (`account-vana-org-web` is implicit in the existing `/auth/oidc/login` flow); `data-connect` is new for the device-code path; `account-vana-org-admin-introspect` is the choice point.

### 1.1 `account-vana-org-web` (browser, confidential)

For all browser-driven OIDC logins to account.vana.org. Used by both the existing `/auth/oidc/login` consent flow (`src/lib/auth/oidc-routes.ts:97`) and the new `/api/auth/session` Privy-bridge that synthesizes a login challenge with `prompt=none`.

```json
{
  "client_id": "account-vana-org-web",
  "client_name": "account.vana.org",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "redirect_uris": [
    "https://account-dev.vana.org/auth/callback",
    "http://localhost:3000/auth/callback"
  ],
  "scope": "openid offline",
  "audience": ["account.vana.org"],
  "access_token_strategy": "opaque",
  "token_endpoint_auth_method": "client_secret_post",
  "subject_type": "public"
}
```

Per-client lifespans (set via `PUT /admin/clients/{id}/lifespans`):

```json
{
  "authorization_code_grant_access_token_lifespan": "15m",
  "authorization_code_grant_refresh_token_lifespan": "720h",
  "refresh_token_grant_access_token_lifespan": "15m",
  "refresh_token_grant_refresh_token_lifespan": "720h"
}
```

Already in place: the OIDC login/consent UI flow at `src/app/auth/oidc/login/route.ts` and `src/app/auth/oidc/consent/route.ts`, the consent-policy evaluator (`src/lib/auth/oauth-client-policy.ts`), and `acceptLoginRequest` / `acceptConsentRequest` admin wiring (`src/lib/auth/hydra-admin.ts:173-202`).

New: the per-client lifespan PUT, `audience: ["account.vana.org"]`, and explicit `access_token_strategy: "opaque"`.

### 1.2 `data-connect` (Tauri device flow, public)

For the Tauri data-connect app's "Connect with Vana" button. Per RFC 8628 §3.5, public client; no client secret is shipped in the binary.

```json
{
  "client_id": "data-connect",
  "client_name": "data-connect (Tauri)",
  "grant_types": [
    "urn:ietf:params:oauth:grant-type:device_code",
    "refresh_token"
  ],
  "response_types": [],
  "scope": "openid offline",
  "audience": ["account.vana.org", "vana-personal-server"],
  "access_token_strategy": "opaque",
  "token_endpoint_auth_method": "none",
  "subject_type": "public"
}
```

Lifespans:

```json
{
  "urn:ietf:params:oauth:grant-type:device_code_grant_access_token_lifespan": "15m",
  "urn:ietf:params:oauth:grant-type:device_code_grant_refresh_token_lifespan": "720h",
  "refresh_token_grant_access_token_lifespan": "15m",
  "refresh_token_grant_refresh_token_lifespan": "720h"
}
```

**Audience strategy.** The original plan (1.8) called for `["account.vana.org", "https://*.myvana.app"]` to let PS introspect the same token. Per §6 below, Hydra does **not** support wildcard audiences. The pragmatic workaround: a single literal token string `vana-personal-server` that any PS recognizes. PS pins the user to itself by checking `sub === <its configured owner vana_user_id>`, not by URL match. This keeps `aud` static, makes the consent-policy code simple, and removes the per-PS-URL re-issuance problem.

### 1.3 `account-vana-org-admin-introspect` — choice

Two options for how account.vana.org backend authenticates to Hydra admin when introspecting tokens (see §4):

- **Option A — Keep Google ID-token IAM (status quo).** `src/lib/auth/hydra-admin.ts:298-300` already mints a Google ID-token bound to the Cloud Run audience and sends it as Bearer. No new Hydra client needed. Works because Hydra admin runs behind Cloud Run IAM in our deployment.
- **Option B — A Hydra `client_credentials` confidential client whose access token is used to call `/admin/oauth2/introspect`.** Portable across Hydra deployments that don't sit behind Cloud Run; but introduces a second Hydra client we need to rotate secrets for.

**Decision: Option A.** We already have the wiring; introspection is a low-volume server-to-server call from the same VPC; the GCP IAM dependency is acceptable. If we ever move Hydra off Cloud Run we add Option B then.

This means **no new Hydra client** is created for introspection. The `scripts/setup-hydra-clients.ts` in §5 handles only `account-vana-org-web` and `data-connect`.

---

## 2. Token lifecycle (three flows)

### 2.1 Flow A — Browser login (Privy bridge)

This replaces the bespoke session adapter today (`ACCOUNT_LOGIN_SESSION_COOKIE` etc.). Per plan 3.3.

1. **Tauri/web client** completes Privy login, obtains a Privy `id_token` (JWT).
2. **Client** POSTs `{ id_token }` to `/api/auth/session` on account.vana.org.
3. **`/api/auth/session`** verifies the Privy id_token via the Privy SDK: `aud === PRIVY_APP_ID`, `iat` within ±5min, signature valid against Privy's JWKS. (Nonce is deferred per plan §"Out of scope".)
4. **`/api/auth/session`** resolves Privy DID → `vana_user_id` via existing user-resolver (`src/lib/auth/login-session-adapter.ts`'s `resolveLoginEvidence`-equivalent path).
5. **`/api/auth/session`** synthesizes a Hydra authorize call server-side: `GET /oauth2/auth?client_id=account-vana-org-web&response_type=code&scope=openid+offline&redirect_uri=...&prompt=none&state=<csprng>`. Hydra returns a login challenge.
6. **`/api/auth/session`** calls Hydra admin `acceptLoginRequest(challenge, { subject: vanaUserId })` (`src/lib/auth/hydra-admin.ts:173`), then `acceptConsentRequest` with the policy-derived scope+audience (`src/lib/auth/oidc-routes.ts:180`).
7. **`/api/auth/session`** follows Hydra's redirect chain server-side until it has the authorization code. POSTs to `/oauth2/token` with `grant_type=authorization_code, code, redirect_uri, client_id, client_secret`. Receives `{ access_token, refresh_token, expires_in, token_type: "bearer" }`.
8. **`/api/auth/session`** writes the refresh token to `vana_refresh_tokens` encrypted with `VANA_REFRESH_TOKEN_KEK` (per plan 1.2), keyed by `hydra_session_id`. `hydra_session_id` is extracted from introspecting the access token's `ext.session_id` (or by reading the consent context).
9. **Response shape decision: `/api/auth/session` always returns 200 JSON `{ access_token, expires_in, token_type: "Bearer" }` AND sets cookies.** SPA clients (data-connect web / future) read the JSON body. Browser-only callers ignore the body and rely on cookies. The route does **not** redirect; redirection is the caller's job (the post-login UI flow already handles `return_to`).
10. **`Set-Cookie` headers:**
    - `vana_session=<access_token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900` — used by SSR/navigation paths and safe (GET/HEAD) routes.
    - `vana_session_access=<access_token>; Secure; SameSite=Lax; Path=/; Max-Age=900` — JS-readable, used as `Authorization: Bearer` source for state-mutating fetches (per plan 1.4).
    - **Refresh token never goes in a cookie.** It lives encrypted in `vana_refresh_tokens` server-side, retrievable only via the user's session.
11. **Client** redirects to the intended app page.

### 2.2 Flow B — Refresh

Triggered when any client (browser or Tauri) sees a 401 from a Vana-session-protected route.

1. **Client** POSTs to `/api/auth/refresh` with no body. The route requires the `vana_session` cookie OR (for Tauri) a separate `x-vana-refresh-token-id` header that maps to a row in `vana_refresh_tokens`.
2. **Route** looks up the encrypted refresh token by `hydra_session_id` (from the cookie or header), decrypts with `VANA_REFRESH_TOKEN_KEK`.
3. **Route** posts to Hydra `/oauth2/token`: `grant_type=refresh_token&refresh_token=<rt>&client_id=account-vana-org-web&client_secret=<>`. (For data-connect: same call, `client_id=data-connect`, no secret.)
4. **Hydra** returns `{ access_token (new), refresh_token (new — rotated), expires_in }`.
5. **Route** rotates the row: sets `rotated_at = now()`, encrypts the new refresh token, stores it under the same `family_id`. Reuse detection: if the route is called with a refresh token whose row already has `rotated_at IS NOT NULL`, the entire `family_id` is revoked at Hydra and tombstoned in DB.
6. **Route** updates `Set-Cookie` for `vana_session` + `vana_session_access` and returns `{ access_token, expires_in }`. Tauri reads the JSON and updates its keyring; browser clients ignore the JSON.

### 2.3 Flow C — Device flow (Tauri)

Per plan 1.8 / 7.5. Uses Hydra's native RFC 8628 endpoints (audit §7); no custom routes on account.vana.org other than the verification UI page.

1. **data-connect** POSTs to Hydra `/oauth2/device/auth` with `client_id=data-connect&scope=openid+offline&audience=account.vana.org%20vana-personal-server`. Receives `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`.
2. **data-connect** opens the user's default browser to `verification_uri_complete` via Tauri's `shell::open`.
3. **Browser** lands on `account.vana.org/auth/device?user_code=...` (the `verification_uri` is `https://account-dev.vana.org/auth/device`; we proxy `user_code` through the URL).
4. **`/auth/device` page** (already exists at `src/app/auth/device/page.tsx`):
   - If user is not logged in: redirect to `/login?return_to=/auth/device?user_code=...`.
   - Once logged in: call Hydra admin `getDeviceUserCodeRequest({ user_code })` to fetch the requesting client's name and scopes (anti-phishing display).
   - Show a confirmation screen ("data-connect wants to access your Vana account").
   - On Confirm: call Hydra admin `acceptUserCodeRequest({ user_code, subject: vanaUserId, grant_scope: [...], grant_access_token_audience: [...] })`. (Note: `acceptUserCodeRequest` and `getDeviceUserCodeRequest` need to be added to `src/lib/auth/hydra-admin.ts`.)
5. **data-connect**, meanwhile, polls Hydra `/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=<>&client_id=data-connect` at the `interval` (default 5s). Honors `slow_down` and `authorization_pending` per RFC 8628.
6. **On success:** Hydra returns `{ access_token, refresh_token, expires_in, token_type: "Bearer" }`.
7. **data-connect** stores tokens in OS keyring (Tauri secure-storage plugin: macOS Keychain / Windows Credential Manager / Linux libsecret).
8. **data-connect** calls `account.vana.org/api/servers` with `Authorization: Bearer <access>` to discover the user's PS URL, populates `remoteServerUrl` in app config.

---

## 3. Logout (fail-closed)

Per plan 1.7, expanded with code shape and retry policy. Implements at `/api/auth/logout`.

```ts
// src/app/api/auth/logout/route.ts
export async function POST(req: NextRequest): Promise<Response> {
  const session = await getVanaSession(req);
  if (!session) return new Response(null, { status: 204 });

  // Step 1: tombstone (synchronous, must succeed).
  // Multi-lambda safe: vana_session_tombstones is DB-backed.
  // Verifier checks this on every introspection cache hit.
  await addSessionTombstone({
    hydraSessionId: session.sessionId,
    vanaUserId: session.vanaUserId,
    expiresAt: addMinutes(now(), 15), // > max access TTL
  });

  // Step 2: clear cookies.
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    "vana_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/",
  );
  headers.append(
    "Set-Cookie",
    "vana_session_access=; Max-Age=0; Secure; SameSite=Lax; Path=/",
  );

  // Step 3-4: best-effort Hydra calls. Failures are non-critical because the
  // tombstone is the source of truth for our own verifier.
  void revokeRefreshTokenAtHydra(session.sessionId).catch(scheduleRetry);
  void endHydraSsoSession(session.sessionId).catch(scheduleRetry);

  return new Response(null, { status: 204, headers });
}
```

**`revokeRefreshTokenAtHydra`** decrypts the row from `vana_refresh_tokens` and posts to Hydra `/oauth2/revoke` with `token=<rt>&token_type_hint=refresh_token&client_id=...` (with secret for `account-vana-org-web`). It then deletes the row.

**`endHydraSsoSession`** calls `DELETE /admin/oauth2/auth/sessions/login?subject=<vanaUserId>` so the next authorize won't silently re-issue a session via Hydra's SSO cookie (audit §10). Note: this kills _all_ of the user's Hydra login sessions, which is fine for our threat model — we want logout to be aggressive.

**Retry queue.** In-process, in-memory queue is sufficient for now. The tombstone is the source of truth: a permanently-stuck Hydra revoke leaves a valid Hydra-side refresh token that will never be used (the encrypted row in `vana_refresh_tokens` is gone, so we can't use it; an attacker would need both the KEK and a row that no longer exists). Worst-case is a stale Hydra session record. Document as known orphan; surface in `security-debt.md` if the queue ever has persistent failures (operational concern, not a security one).

If step 1 fails (DB write): return 500. Client should retry. The session remains valid until the access token's `exp`, but no further damage.

---

## 4. Introspection proxy

Per plan 1.11. account.vana.org exposes `/api/oauth/introspect` for PS to call. PS does not get GCP creds for Hydra admin.

### 4.1 Request

```http
POST /api/oauth/introspect HTTP/1.1
Host: account-dev.vana.org
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <PS-issued service token>

token=<opaque access token>
```

PS authentication to this route is **out of scope of this Hydra doc** — see plan 7.6 for the PS-side trust path. The simplest is a shared HMAC or mutual-TLS; document separately.

### 4.2 Response

```json
{
  "active": true,
  "sub": "vu_01HXY...",
  "aud": ["account.vana.org", "vana-personal-server"],
  "client_id": "data-connect",
  "exp": 1712345678,
  "iat": 1712344778,
  "scope": "openid offline",
  "token_use": "access_token",
  "tombstoned": false,
  "ext": {}
}
```

Notable additions over Hydra's raw introspection response:

- **`tombstoned: boolean`** — set by checking `vana_session_tombstones` for the introspected token's `ext.session_id`. If `tombstoned: true`, PS rejects the token regardless of `active`.
- **`active: false`** is returned (not 401) when Hydra reports the token inactive OR the token is tombstoned. This matches RFC 7662.

### 4.3 Implementation

```ts
// src/app/api/oauth/introspect/route.ts
export async function POST(req: NextRequest): Promise<Response> {
  await requirePsClientCredentials(req); // out of scope of this doc

  const formData = await req.formData();
  const token = formData.get("token");
  if (typeof token !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const hydra = createHydraAdminClient();
  const result = await hydra.introspectToken(token); // new method, see below

  if (!result.active) {
    return Response.json({ active: false });
  }

  const sessionId = extractSessionId(result); // result.ext.session_id
  const tombstoned = sessionId ? await isSessionTombstoned(sessionId) : false;

  return Response.json({
    ...result,
    tombstoned,
    active: result.active && !tombstoned,
  });
}
```

`introspectToken` is added to `createHydraAdminClient()` in `src/lib/auth/hydra-admin.ts`. It POSTs to `/admin/oauth2/introspect` with `application/x-www-form-urlencoded` body `token=<>` and reuses the existing Google ID-token Bearer flow (`fetchGoogleIdTokenForAudience`).

### 4.4 Rate limiting

Per-PS-client rate limit: 100 req/sec sustained, 500 burst. Implemented at the edge (Vercel KV or upstream). Each PS introspects each unique token at most once per 30s anyway (PS-side cache), so 100/s comfortably covers a Memory-App-class workload.

### 4.5 Error handling

- Hydra admin unreachable → 502 with `{ error: "introspection_unavailable" }`. PS treats this as "token rejected" (fail-closed).
- Tombstone DB unreachable → 502 with same. PS fails closed.
- Invalid PS auth → 401.

---

## 5. Setup script — `scripts/setup-hydra-clients.ts`

Idempotent one-shot. Run by the dev (`tsx scripts/setup-hydra-clients.ts`) and in CI before any deploy that touches client config.

```ts
// scripts/setup-hydra-clients.ts
import "dotenv/config";
import { createHydraAdminClient } from "../src/lib/auth/hydra-admin";

type ClientSpec = {
  client_id: string;
  config: Record<string, unknown>;
  lifespans: Record<string, string>;
};

const CLIENTS: ClientSpec[] = [
  {
    client_id: "account-vana-org-web",
    config: {
      client_name: "account.vana.org",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: [
        "https://account-dev.vana.org/auth/callback",
        "http://localhost:3000/auth/callback",
      ],
      scope: "openid offline",
      audience: ["account.vana.org"],
      access_token_strategy: "opaque",
      token_endpoint_auth_method: "client_secret_post",
      subject_type: "public",
    },
    lifespans: {
      authorization_code_grant_access_token_lifespan: "15m",
      authorization_code_grant_refresh_token_lifespan: "720h",
      refresh_token_grant_access_token_lifespan: "15m",
      refresh_token_grant_refresh_token_lifespan: "720h",
    },
  },
  {
    client_id: "data-connect",
    config: {
      client_name: "data-connect (Tauri)",
      grant_types: [
        "urn:ietf:params:oauth:grant-type:device_code",
        "refresh_token",
      ],
      response_types: [],
      scope: "openid offline",
      audience: ["account.vana.org", "vana-personal-server"],
      access_token_strategy: "opaque",
      token_endpoint_auth_method: "none",
      subject_type: "public",
    },
    lifespans: {
      "urn:ietf:params:oauth:grant-type:device_code_grant_access_token_lifespan":
        "15m",
      "urn:ietf:params:oauth:grant-type:device_code_grant_refresh_token_lifespan":
        "720h",
      refresh_token_grant_access_token_lifespan: "15m",
      refresh_token_grant_refresh_token_lifespan: "720h",
    },
  },
];

async function main() {
  const hydra = createHydraAdminClient();

  for (const spec of CLIENTS) {
    const existing = await hydra.getClient(spec.client_id).catch(() => null);

    if (existing) {
      console.log(`[setup-hydra-clients] PUT ${spec.client_id} (update)`);
      await hydra.putClient(spec.client_id, {
        ...spec.config,
        client_id: spec.client_id,
      });
    } else {
      console.log(`[setup-hydra-clients] POST ${spec.client_id} (create)`);
      await hydra.createClient({
        ...spec.config,
        client_id: spec.client_id,
      });
    }

    console.log(`[setup-hydra-clients] PUT ${spec.client_id} lifespans`);
    await hydra.putClientLifespans(spec.client_id, spec.lifespans);
  }

  console.log("[setup-hydra-clients] done");
}

main().catch((err) => {
  console.error("[setup-hydra-clients] failed:", err);
  process.exit(1);
});
```

**New methods on `createHydraAdminClient()`** in `src/lib/auth/hydra-admin.ts` (currently has only login/consent/logout admin operations at lines 127-227):

- `getClient(clientId)` — `GET /admin/clients/{id}`
- `createClient(body)` — `POST /admin/clients`
- `putClient(clientId, body)` — `PUT /admin/clients/{id}`
- `putClientLifespans(clientId, lifespans)` — `PUT /admin/clients/{id}/lifespans`
- `introspectToken(token)` — `POST /admin/oauth2/introspect` (form-encoded)
- `getDeviceUserCodeRequest(userCode)` — `GET /admin/oauth2/auth/requests/device/verify`
- `acceptUserCodeRequest(userCode, body)` — `PUT /admin/oauth2/auth/requests/device/accept`

**Secrets handling.** `account-vana-org-web` is a confidential client; the script reads the secret from `HYDRA_CLIENT_SECRET_ACCOUNT_WEB` env var. If absent, the script generates a random 32-byte hex string, writes it to stdout once, and the operator must propagate it to Vercel/secrets manager. Subsequent runs do not regenerate (idempotent).

---

## 6. Open Hydra-specific questions

### 6.1 Wildcard audiences — NOT supported (resolved)

Hydra's `audience` field is a strict array of strings. Wildcards are not parsed; `https://*.myvana.app` would be treated as the literal string. (Confirmed by reading `OAuth2Client.audience` schema in hydra-client-go and matching docs in `_research/hydra-capability-audit.md` §6.) The plan's `audience: ['account.vana.org', 'https://*.myvana.app']` does not work as written.

**Resolution: use a single literal `vana-personal-server` audience string.** Every PS deployment recognizes this audience. PS-to-user binding is enforced by PS comparing the introspected `sub` claim to its configured owner `vana_user_id`, not by URL match. This is documented in §1.2 above.

If we ever need per-PS audiences (e.g. for fine-grained authorization where one user has multiple PSes), the path forward is: register one Hydra client per PS, each with its own explicit audience string, minted at PS-creation time. This is deferred until multi-PS-per-user becomes a real requirement.

### 6.2 Deployed Hydra version (oauth-dev.vana.org)

Per `_research/hydra-capability-audit.md`, the live deployment exposes:

- `device_authorization_endpoint`
- `revocation_endpoint`
- `end_session_endpoint`
- `credentials_endpoint_draft_00`
- `backchannel_logout_supported: true`

This is consistent with **Hydra v2.2.x or v2.3.x** (v2.2.0 introduced the device flow). All admin operations referenced in this doc (`acceptUserCodeRequest`, `getDeviceUserCodeRequest`, per-client lifespans, `access_token_strategy` on the client object) are available from v2.2.0 onward.

`/version` is not exposed publicly (404). To pin the version exactly, run `gcloud run services describe oauth-hydra --region=... --format='value(spec.template.spec.containers[0].image)'` against the dev deployment. Recommendation: capture the image tag in `_research/hydra-version.md` as a one-time artifact and re-check whenever Hydra is upgraded.

`scopes_supported` in discovery only lists `openid`, `offline`, `offline_access`. This is normal Hydra behavior — custom scopes (e.g. `personal-server`) are accepted at runtime even if not advertised. We do not currently use any custom scopes; all access control is via `aud` + `sub` + per-route policy.

---

## 7. Summary of code changes

What's already in place (reuse, don't rebuild):

- `createHydraAdminClient()` — `src/lib/auth/hydra-admin.ts:114`. Login/consent/logout admin ops wired.
- OIDC login/consent runtime — `src/lib/auth/oidc-routes.ts`, `src/app/auth/oidc/login/route.ts`, `src/app/auth/oidc/consent/route.ts`.
- `buildHydraSessionClaims()` — `src/lib/auth/hydra-admin.ts:230`. Currently writes only to `id_token`; do not change in this slice.
- Device verification UI scaffold — `src/app/auth/device/page.tsx` (per `find` output; needs to be wired to the new admin methods).

What's new in this slice:

- `getClient`, `createClient`, `putClient`, `putClientLifespans`, `introspectToken`, `getDeviceUserCodeRequest`, `acceptUserCodeRequest` on `createHydraAdminClient()`.
- `scripts/setup-hydra-clients.ts`.
- `/api/auth/logout` route with tombstone-first ordering.
- `/api/oauth/introspect` route (introspection proxy).
- `/api/auth/refresh` route (refresh-token rotation).
- Wiring `/auth/device` page to the new device-flow admin methods.
- Adding `vana-personal-server` audience constant; PS-side recognition is in plan 7.6.

What's deliberately not in this slice (covered by other docs in `01-architecture.md`):

- `getVanaSession()` verifier itself (plan 1.4).
- `vana_refresh_tokens` table DDL and KEK rotation (plan 1.2).
- Privy-bridge nonce mechanism (deferred per plan §"Out of scope").
- Branded `VanaUserId` type and tripwire middleware (plan 1.9, stage 6).
