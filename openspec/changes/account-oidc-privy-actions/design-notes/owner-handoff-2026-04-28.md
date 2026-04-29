# Owner Handoff

Date: 2026-04-28
Change: `account-oidc-privy-actions`

## State

The auth architecture direction changed from "try `oidc-provider` in Next first" to "reuse/evaluate Ory Hydra first, with managed issuer POCs as alternatives and `oidc-provider` as fallback evidence."

This is based on:

- prior Vana Hydra implementation in `vana-com/vana-oauth`
- prior Vana login/consent/token integration in `vana-gotchi-js-api` and `vana-gotchi-pwa`
- current Hydra viability research
- managed issuer POC research
- completed Claude `oidc-provider` route-handler spike
- completed Claude Hydra `v26.2.0` local POC

## Current Recommendation

Use Ory Hydra as the control path, but upgrade it. Do not run the old `v2.1.2` image in production.

Near-term comparison:

- **Self-hosted Hydra `v26.2.0+`**: best continuity with old Vana implementation; higher ops burden; strong identity/control fit.
- **Ory Network/OEL**: same model with managed ops/vendor support; needs cost/control review.
- **Stytch Connected Apps**: strongest managed alternative on paper; must prove exact `sub = vana_user_id`.
- **WorkOS Connect/AuthKit**: promising but must prove exact `sub` and custom consent/action UX.
- **`oidc-provider`**: credible self-hosted Node fallback; route-handler bridge works but should not be default.

## Active Workers

- Claude `main:cc-hydra-audit` completed local prior-art archaeology in `/home/tnunamak/code/vana-connect/.claude/worktrees/hydra-prior-art-audit`; report is in that worktree at `tmp/workstreams/hydra-prior-art-audit-report.md`.
- Claude `main:cc-account-oidc` completed route-handler spike at `cda0b6251` and is idle.
- Claude `main:cc-hydra-poc` completed the local Hydra `v26.2.0` POC at `354eb4051`; the imported artifact is `spikes/hydra-v26-poc/`.

## Completed Research

- Codex: OIDC issuer decision.
- Codex: auth client compatibility.
- Codex: Privy custom auth boundary.
- Codex: hosted auth vendor escape hatch.
- Codex: consent/action UX prior art.
- Codex: OAuth/OIDC security constraints.
- Codex: Ory Hydra current-state and upgrade viability.
- Codex: WorkOS/Stytch managed issuer POC criteria.
- Codex: old Vana Ory implementation archaeology.

## Important Facts

- `account.vana.org/.well-known/openid-configuration` currently returns 404, so Login with Vana is not standard OIDC today.
- Old Vana Hydra public URL was `https://development-oauth.vana.com`.
- Old Vana Hydra admin URL was `https://development-oauth-admin.vana.com`.
- Old Hydra accepted login with `subject: account.id`, matching the new `sub = vana_user_id` posture.
- Old JS API introspected `ory_at_` tokens through Hydra Admin and exchanged them for Vana JWTs.
- Old Hydra TTLs were too long (`168h`) and should not be copied.
- Current Hydra OSS target should be `v26.2.0+` because older versions are affected by CVE-2026-33504.
- The local Hydra POC proves discovery, JWKS reachability, public Authorization Code + PKCE, missing-`code_challenge` rejection for a public client, Vana-owned login/consent callback control, `sub = vana_user_id`, userinfo, admin introspection, and refresh.
- The local Hydra POC does not prove ID token signature verification, production authentication, production consent UX, key rotation, revocation, resource-server policy, or deployment hardening.
- Old Cafe/SPAs should not be copied if they put `client_secret` in browser-reachable code.
- Old Hasura-specific JWT claims, `*@vana.com` admin mapping, guest-by-IP account creation, and signup-credit logic inside the login handler should not be copied.
- Old `deploy-hydra.sh` likely has a string-vs-numeric comparison bug around `admin`; verify no live admin service was exposed before reusing any deployment code.

## Next Work Packets

1. Decide whether to keep the Hydra spike in `vana-connect`, resurrect `vana-oauth` as a separate repo/service, or move to Ory Network.
2. Convert the Hydra POC result into a production issuer decision: self-hosted Hydra, Ory Network, managed issuer, or `oidc-provider` sidecar fallback.
3. Decide whether account APIs should consume opaque Hydra tokens through introspection or Vana-issued JWTs minted after introspection.
4. Confirm Privy custom JWT integration against the chosen issuer/JWKS.
5. Run one managed issuer POC or vendor confirmation for WorkOS/Stytch exact subject and issuer-domain behavior.
6. Only after issuer selection, implement Memory App OIDC fixture and mock action-code flow.
7. If any old OAuth deployment remains live, rotate/revoke public SPA clients that used leaked or browser-visible secrets.

## Cleanup Already Done

The owner worktree no longer has the abandoned `oidc-provider` dependency in `connect/package.json`, and root `pnpm-lock.yaml` was restored after add/remove churn. The `oidc-provider` code remains isolated in the worker branch for evidence.

## Confidence

Overall confidence: 0.97.

Main residual risks:

- exact Hydra migration effort from `v2.1.2`
- current Vana deployment ownership for a resurrected OAuth service
- whether Ory Network is preferable to self-hosted Hydra
- whether WorkOS/Stytch can issue exact `sub = vana_user_id`
