# Privy Custom Authentication Runbook

Privy JWT-based custom authentication is the path that keeps Vana account ids
as the wallet provider's root identity. It is currently plan-gated in Privy
behind the Scale tier / Custom authentication plugin, so the app keeps the
runtime sync disabled until Privy enables the feature.

## Current Prepared State

- Vana signs RS256 JWTs with `sub=<vana_user_id>`.
- `/.well-known/jwks.json` publishes only the public signing key.
- `/api/auth/privy-custom-auth-jwt` returns a Vana-signed JWT for a verified
  account session.
- `VanaJwtAuthSync` is mounted under `PrivyProvider` and calls Privy's
  `useSyncJwtBasedAuthState`.
- Browser sync is disabled unless
  `NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED=true`.

## Dev Dashboard Setup

In the Privy dashboard for the dev app:

1. Enable or request `Custom authentication` under `Integrations > Plugins`.
2. Go to `User management > Authentication > JWT-based auth`.
3. Set authentication environment to `client-side`.
4. Set verification to `JWKS URL`.
5. Set JWKS URL to `https://account-dev.vana.org/.well-known/jwks.json`.
6. Set JWT ID claim to `sub`.
7. Save.

If `JWT-based auth` is not visible, the app does not have the gated feature yet.

## Dev Switch-On

After the dashboard setup is saved:

1. Confirm diagnostics:

   ```bash
   pnpm --filter connect auth:smoke-custom-jwt -- https://account-dev.vana.org
   ```

2. Set preview env:

   ```bash
   vercel env add NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED preview tim/account-domain-identity-issuer --scope opendatalabs
   ```

   Value: `true`

3. Redeploy the `connect` Vercel project and alias it to `account-dev.vana.org`.
4. Sign in at `https://account-dev.vana.org/login`.
5. Verify Privy user behavior:
   - The custom-auth identifier is the Vana `vana_user_id`.
   - Existing Privy-native users do not unexpectedly lose embedded wallet access.
   - OIDC tokens still use `vana_user_id` as `sub`.

## Rollback

Set `NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED=false` and redeploy. The
transitional Privy-native login path remains available while the feature flag is
off.

## Production Notes

- Do not reuse the dev signing key.
- Prefer KMS-backed signing for production. Raw PEM env is acceptable for dev
  proof only.
- Rotate by publishing old and new keys in JWKS during the overlap window, then
  retiring the old `kid` after all short-lived JWTs expire.
- Keep diagnostics hidden in production unless `AUTH_DIAGNOSTICS_ENABLED=true`
  is explicitly set for a short troubleshooting window.
