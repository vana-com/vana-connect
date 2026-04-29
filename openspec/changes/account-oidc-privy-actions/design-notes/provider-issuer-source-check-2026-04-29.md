# Provider / Issuer Source Check

Date: 2026-04-29

This note captures source-backed facts that affect the `account.vana.org` auth direction. It is intentionally narrow: it records what is confirmed by current provider documentation and what remains an inference or implementation risk.

## Privy Custom Auth

Confirmed:

- Privy supports JWT-based/custom authentication for apps that already own login. Privy states that users can keep the existing app login while gaining access to embedded wallets.
- Privy custom-auth setup verifies Vana-issued JWTs through a JWKS or public key and uses a configured JWT ID claim, defaulting to `sub`.
- Privy's React SDK custom-auth guidance says not to call Privy's normal `login` when using a custom auth provider.
- Privy's wallet authentication API accepts `user_jwt` and returns authorization material for wallet actions.
- Privy can create/import users with `custom_auth` linked accounts using `custom_user_id`, and can look users up by custom auth ID.

Sources:

- <https://docs.privy.io/authentication/user-authentication/jwt-based-auth/overview>
- <https://docs.privy.io/authentication/user-authentication/jwt-based-auth/setup>
- <https://docs.privy.io/authentication/user-authentication/jwt-based-auth/usage>
- <https://docs.privy.io/api-reference/wallets/authenticate>
- <https://docs.privy.io/security/authentication/authenticated-signers>
- <https://docs.privy.io/user-management/migrating-users-to-privy/create-or-import-a-user>
- <https://docs.privy.io/user-management/migrating-users-to-privy/create-or-import-a-batch-of-users>
- <https://docs.privy.io/api-reference/users/get-by-custom-auth>

Design implication:

- Target state is feasible: `account.vana.org` can own primary auth, issue `sub = vana_user_id`, and have Privy trust that subject for wallet access.
- The Privy durable custom-auth identifier should be the Vana account id carried in the configured JWT ID claim. Vana should still store Privy's own user id as provider metadata.

Migration risk:

- Starting with Privy-native login is workable for the first slice, but switching later to Vana-issued JWT/custom auth is not proven to be automatic. The safe assumption is that Vana needs a tested migration or linking path from existing Privy-native users to future `custom_auth` users without changing embedded wallet addresses.
- Deleting and recreating Privy users is not an acceptable migration strategy because Privy documents that recreated users receive new ids and embedded wallets.

Open validation:

- Confirm with Privy or a live test whether an existing Privy-native user can later have a Vana `custom_auth` linked account attached while preserving the same Privy user id and embedded wallet.

## Ory Hydra / Ory Network

Confirmed:

- Ory supports Vana-owned OAuth2/OIDC login and consent UI. Hydra/Ory redirects to configured login and consent URLs with `login_challenge` and `consent_challenge`; the app accepts or rejects through Ory APIs.
- Ory Network supports custom domains on paid plans. Ory's docs describe custom domains as the project SDK Configuration URL and include Vercel DNS guidance.
- The login accept call lets the app supply the `subject`, so `sub = vana_user_id` is directly compatible with the model.
- Self-hosted Hydra has public and admin ports. The admin port has no built-in access control and must not be exposed directly.
- Opaque access tokens are the default. JWT access tokens are supported globally or per client. Refresh tokens remain opaque. Stateful JWT access tokens can still use introspection and revocation; stateless JWT mode changes that behavior.

Sources:

- <https://www.ory.com/docs/hydra/guides/custom-ui-oauth2>
- <https://www.ory.com/docs/oauth2-oidc/custom-login-consent/flow>
- <https://www.ory.com/docs/guides/custom-domains>
- <https://www.ory.com/docs/hydra/self-hosted/production>
- <https://www.ory.com/docs/oauth2-oidc/jwt-access-token>
- <https://www.ory.com/docs/self-hosted/oel/oauth2/stateless-jwt>

Design implication:

- Hydra remains the implementation path for the next slice. The exact deployment shape is still open: self-hosted Hydra with isolated admin API, Ory Network, or a managed issuer fallback if production operations or security review blocks Hydra.
- The default account/resource API posture should start from opaque tokens plus introspection or a deliberate Vana-token exchange. JWT access tokens are an option, not the default assumption.

Open validation:

- After custom-domain setup, verify `https://account.vana.org/.well-known/openid-configuration` reports the exact issuer OIDC clients will use.
- Decide whether Hydra admin operations live inside `account.vana.org` server routes, a small internal adapter service, or a separate deployment lane.
