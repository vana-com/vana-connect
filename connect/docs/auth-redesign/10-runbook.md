# Runbook — End-to-End Validation

For when Tim returns. Validates the auth-redesign work end-to-end with two
manual steps (Privy login, ChatGPT Playwright login).

## Pre-flight (claude self-checks before declaring done)

Run these before you sit down. Each must pass.

- [ ] `npx tsc --noEmit` is clean across `vana-connect/connect`.
- [ ] `npx vitest run src/lib/auth src/lib/db` passes (excluding DB-backed
      tests that require `DATABASE_URL`).
- [ ] All open questions in `01-architecture.md §1.12` have your sign-off.
- [ ] Migration `008_auth_signing_plane.sql` runs cleanly against the dev
      DB (apply with your existing migration runner).
- [ ] Vercel envs set on Preview for `vana-connect/connect`:
  - `REFRESH_TOKEN_ENC_KEY` (32-byte base64). Generate with
    `node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'`
  - `HYDRA_ADMIN_URL` (already exists)
  - `HYDRA_ADMIN_AUDIENCE` (already exists)
  - `HYDRA_PUBLIC_URL` (already exists)
  - `VANA_SESSION_EXPECTED_AUDIENCE=account.vana.org`
- [ ] Hydra OAuth clients exist:
  - `vana-account-web` — code+refresh, opaque, aud=`account.vana.org`
  - `data-connect` — device-code+refresh, opaque, aud=`account.vana.org`
    (per-user PS URLs added at consent time)

## What's NOT yet wired (deferred to next PR after sign-off)

These require live Hydra round-trips to validate so they're best landed
under your eyes:

- `/api/auth/session` rewrite (Privy → Hydra accept-login dance).
- `/auth/device` UI page calling `getDeviceUserCodeRequest` + `acceptUserCodeRequest`.
- `/api/auth/confirmations/:id/{status,consume}` routes.
- Inline `<ConfirmationModal>` component.
- Privy custody adapter (`wallet-providers/privy.ts`).
- Per-flow route migrations (PR-Y, PR-X, PR-Z).
- data-connect remote PS support.
- PS-side Vana session integration.

## Two manual steps you must perform

These cannot be automated:

1. **Privy login.** Open `https://account-dev.vana.org` in a fresh browser
   profile, click sign in, complete Privy's flow.
2. **ChatGPT Playwright login.** Once data-connect is launched, the
   ChatGPT connector opens a browser window for you to log into
   chatgpt.com manually. The connector then scrapes memories and
   conversations.

## End-to-end happy path (target state)

1. **Log in to account-dev.vana.org.** Privy flow completes, you're
   redirected back, browser holds `vana_session` (HttpOnly) and
   `vana_access` (JS-readable) cookies.
2. **Provision a Personal Server.** `/server` page → Provision. The
   register-on-chain step fires `wallet.signTypedData({purpose:
register_personal_server})`. UI shows the inline confirmation modal
   with the typed-data summary; you click Confirm; the route retries
   with `x-vana-confirmation-id`; signature lands; PS is registered on
   the dev gateway.
3. **Register Memory App at /admin.** Sign with master key (Privy prompt);
   POST to `/api/admin/oauth-clients` with the Memory App URL; gets
   `owner_vana_user_id` set.
4. **Launch data-connect** (Tauri app). Settings → Server Mode = Remote
   → "Connect with Vana". Tauri opens browser to Hydra device-flow page;
   you authenticate; data-connect polls Hydra and receives access +
   refresh tokens; auto-discovers your PS URL via
   `account-dev.vana.org/api/servers`.
5. **Run ChatGPT connector.** Sync → Playwright opens browser → you log
   into ChatGPT manually → connector exports memories +
   conversations → ingestion POSTs to your remote PS with `Authorization:
Bearer <vana access token>`. PS's web3-auth middleware matches the
   `vana-session` mechanism, introspects against
   `account.vana.org/api/oauth/introspect`, validates audience includes
   the PS URL, sets owner auth, accepts the write.
6. **Open Memory App demo.** `vana-connect-mobile-dev.vercel.app/demo/
login-with-vana`. Click Import. Approval flow runs against
   account-dev (using your Vana session). Grant is minted on PS via
   real OAuth2 client_credentials. Result_payload includes `grant_id`,
   `personal_server.serverUrl`. Memory App's
   `/demo/login-with-vana/actions/fetch-data` route signs Web3Signed
   with grantee key + grant_id, fetches your real ChatGPT memories from
   PS.

When you see your real ChatGPT memories rendered in Memory App and
none of them match `MOCK_CHATGPT_MEMORIES`, end-to-end is done.

## Diagnostic queries (live DB)

After step 2, verify the signing plane wrote a row:

```sql
SELECT id, purpose, payload_hash, used_count, consumed_at,
       signature_hex IS NOT NULL AS has_sig
FROM signing_authorizations
WHERE vana_user_id = '<your vana_user_id>'
ORDER BY created_at DESC
LIMIT 5;
```

You should see at least one row with `purpose=register_personal_server`,
`used_count=1`, `consumed_at` non-null, `has_sig=true`, and an associated
`confirmation_id` matching a row in `interactive_confirmations` whose
`consumed_at` precedes the authority's.

After logout, verify the tombstone:

```sql
SELECT hydra_session_id, vana_user_id, revoked_at, expires_at
FROM vana_session_tombstones
WHERE vana_user_id = '<your vana_user_id>'
ORDER BY revoked_at DESC LIMIT 5;
```

After ingest, verify a fresh refresh-token row exists:

```sql
SELECT id, family_id, expires_at,
       rotated_at IS NOT NULL AS rotated,
       revoked_at IS NOT NULL AS revoked
FROM vana_refresh_tokens
WHERE vana_user_id = '<your vana_user_id>'
ORDER BY created_at DESC LIMIT 5;
```

## If something breaks

- **`getVanaSession` returns null on a known-good token.** Check
  `HYDRA_PUBLIC_URL` matches the actual Hydra issuer; `iss` mismatch
  is silent. Check `aud` includes `account.vana.org`.
- **`/api/oauth/introspect` returns `active: false` to PS.** Check
  Hydra admin Bearer (Google ID token) is valid; check token isn't in
  `vana_session_tombstones` (we filter NOT in the proxy itself, but
  you'll see it via `getVanaSession`).
- **Confirmation_required keeps re-firing.** Check the client is
  sending `x-vana-confirmation-id` header on retry; check the
  confirmation row exists with `consumed_at IS NOT NULL` and within 30s
  of the retry.
- **PS rejects Vana session with AUDIENCE_MISMATCH.** Verify the
  user's `personal_servers.url` matches what's set as the per-consent
  audience in `acceptUserCodeRequest`. PS validates its own URL.
- **Tripwire fires in dev.** Read the response body diagnostic; the
  match + context tell you which response leaked a provider DID. Fix
  the route, don't disable the tripwire.

## Reverting

If things go badly wrong in dev:

1. Roll back the migration:
   ```sql
   DROP TABLE signing_authorizations, interactive_confirmations,
              vana_refresh_tokens, vana_session_tombstones;
   ALTER TABLE vana_linked_wallets DROP COLUMN key_control_type;
   ALTER TABLE oauth_clients DROP COLUMN owner_vana_user_id;
   ```
2. Revert the merge commit on `develop`.
3. Reset env vars: remove `REFRESH_TOKEN_ENC_KEY`,
   `VANA_SESSION_EXPECTED_AUDIENCE` from Preview.

The legacy `master-key-signature` and `ACCOUNT_LOGIN_SESSION_COOKIE`
machinery is still present; reverting restores the previous behavior.

## Stage progress

| Stage | What                                       | Status                                                |
| ----- | ------------------------------------------ | ----------------------------------------------------- |
| 0     | Discovery + critique                       | done                                                  |
| 1     | Architecture design doc                    | done                                                  |
| 2     | Schema additions                           | done                                                  |
| 3     | Vana session-token plane                   | partial — verifier, introspect proxy, logout, tests   |
| 4     | Atomic per-flow cutovers                   | not started                                           |
| 5     | Signing authority plane                    | partial — orchestrator, payload-hash, purposes, tests |
| 6     | Branded types + dev tripwire               | done                                                  |
| 7     | data-connect remote PS + Hydra device-code | not started                                           |
| 8     | Memory App regression check                | pending stage 4                                       |
| 9     | This runbook                               | done                                                  |
