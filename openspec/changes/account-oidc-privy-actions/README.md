# account-oidc-privy-actions

Implementation-facing OpenSpec change for `account.vana.org` as the Stage 1 auth surface.

This change supersedes `account-domain-identity-issuer` for new implementation planning where they conflict:

- `sub` should be a Vana-owned account subject (`vana_user_id`), not the wallet address.
- Privy is the first wallet provider target because it can sit behind Vana-owned auth.
- Login with Vana should be OIDC-compatible, not only a minimal JWT/JWKS endpoint.
- Account-hosted data actions are separate from OIDC login and must not be represented as ordinary auth scopes.

The issuer implementation decision is not "build OIDC in Next.js by default." Vana has prior Ory Hydra art in `vana-com/vana-oauth`, `vana-gotchi-js-api`, `vana-gotchi-pwa`, and `kubernetes-services`. That prior art, Ory Network/Hydra, and managed issuer options such as WorkOS/Stytch should be evaluated before merging any self-hosted Next route-handler issuer.

A local Hydra `v26.2.0` proof now lives in `spikes/hydra-v26-poc/`. It proves the basic issuer model is executable with `sub = vana_user_id`; it does not settle the production deployment/operations choice.

The earlier change remains useful as implementation context for JWKS, refresh sessions, and provider-adapter boundaries.
