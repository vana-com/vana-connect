# Auth Redesign — Runbook (in-progress)

Status: living doc; updated as each stage lands.

## What's done

- **Stage 1**: Architecture design (`01-architecture.md` + 3 sub-doc drafts in `_drafts/`).
- **Stage 2**: Migration `008_signing_auth_plane.sql` adds the signing-authority + session-tombstone + encrypted-refresh-token tables. Repo functions in `src/lib/db/auth-signing.ts` and `src/lib/db/sessions.ts`. Tests skip without DATABASE_URL.
- **Stage 3 (partial)**: `getVanaSession()` verifier in `src/lib/auth/vana-session.ts` — cached Hydra introspection + DB tombstone check + audience/exp/sub validation.

## What's left

- **Stage 3 remainder**: login bridge rewrite (`/api/auth/session`), `/api/auth/refresh`, `/api/auth/logout`, `/api/oauth/introspect` proxy, `.well-known/oauth-authorization-server`, Hydra setup script.
- **Stage 5**: signing plane — `signing-purposes.ts`, `wallet.ts`, `wallet-providers/privy.ts`, interactive-confirmation routes.
- **Stage 4 (3 PRs)**: cutover routes to `getVanaSession`; cutover `register-on-chain` to `wallet.signTypedData`; decommission legacy device-flow routes.
- **Stage 6**: branded `VanaUserId` TS type sweep + dev tripwire.
- **Stage 7**: data-connect remote PS support + Hydra device-code Login with Vana + PS-side Vana session auth.
- **Stage 8/9**: Memory App regression + runbook for end-to-end test.

## Required environment variables (set before stage 3 ships)

These need to be added to Vercel (Preview + Development) and `.env.local` before the new auth plane will function. None are committed to the repo.

| Var                              | Source                       | Notes                                                                                     |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `REFRESH_TOKEN_ENC_KEY`          | 32 random bytes, base64      | Must be DISTINCT from `PRIVY_SIGNER_PRIVATE_KEY`. Generate via `openssl rand -base64 32`. |
| `REFRESH_TOKEN_ENC_KEY_OLD`      | optional, base64             | Set during KEK rotation; allows decrypt of pre-rotation rows.                             |
| `VANA_SESSION_EXPECTED_AUDIENCE` | `account.vana.org`           | Audience the verifier requires on access tokens.                                          |
| `HYDRA_PUBLIC_URL`               | `https://oauth-dev.vana.org` | Already set; `iss` pinning.                                                               |
| `HYDRA_ADMIN_URL`                | already set                  | Cloud Run admin URL.                                                                      |
| `HYDRA_ADMIN_AUDIENCE`           | already set                  | Cloud Run audience for Google ID-token Bearer.                                            |

## End-to-end test path (after all stages land)

1. **Vercel envs**: confirm `REFRESH_TOKEN_ENC_KEY` is set on the Preview environment for `vana-connect/connect`.
2. **Migration**: run `008_signing_auth_plane.sql` on the dev DB. The migration is idempotent and includes the greenfield wipe of `personal_servers`.
3. **Reprovision PS**: `account-dev.vana.org/server` → log in via Privy → click Provision. The `personal_servers` row will be re-created with `user_id = vana_user_<…>` instead of the old wallet-address shape.
4. **Login with Vana on data-connect**: open Tauri data-connect → Settings → "Connect with Vana" → device code displays → browser opens to `account-dev.vana.org/auth/device` → Privy login if needed → click Approve → Tauri receives access + refresh tokens.
5. **Discover remote PS**: data-connect calls `account-dev.vana.org/api/servers` with the new Bearer token → reads PS URL → auto-populates `remoteServerUrl` setting.
6. **Run ChatGPT connector**: data-connect → Connectors → ChatGPT → Sync. Playwright opens; **manual step: log in to ChatGPT in the visible browser window**. Connector exports memories + conversations.
7. **Ingest to remote PS**: connector exports get POSTed to `<remoteServerUrl>/v1/data/<scope>` with Bearer = the data-connect access token. PS introspects via `account.vana.org/api/oauth/introspect` and accepts as owner-equivalent.
8. **Memory App grant**: open `vana-connect-mobile-dev.vercel.app/demo/login-with-vana` → click "Connect ChatGPT" → review on account-dev → **manual step: click Confirm in the inline modal** (the new `interactive_confirmations` flow). Action exchange returns `grant_id` + `personal_server` URL.
9. **Memory App fetch**: Memory App's `/demo/login-with-vana/actions/fetch-data` route signs `Web3Signed grant_id` with `MEMORY_APP_GRANTEE_PRIVATE_KEY` and calls `<psUrl>/v1/data/chatgpt.memories`. Returns the real memories Tim ingested in step 6.
10. **Display**: `memory-app-demo.tsx` renders the real memories instead of `MOCK_CHATGPT_MEMORIES`.

## Manual steps (the only two)

- **Privy login** in step 4 (and step 8 if not already authed).
- **ChatGPT Playwright login** in step 6.

## Rollback

This is a forward-only refactor on dev. To roll back:

1. Drop in reverse order: `vana_refresh_tokens`, `vana_session_tombstones`, `signing_authorizations`, `interactive_confirmations`.
2. Drop columns: `oauth_clients.owner_vana_user_id`, `vana_linked_wallets.key_control_type`.
3. Drop type: `vana_key_control_type`.
4. `personal_servers` must be reprovisioned regardless of direction.
