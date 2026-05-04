# Managed Issuer Confirmation

Date: 2026-04-29

This note records whether a managed issuer can satisfy the two OIDC requirements that matter for the account-domain design:

- Discovery and ID-token issuer must be exactly the account-domain issuer clients configure, expected to be `https://account.vana.org`.
- ID-token `sub` must be a Vana-owned stable account id, expected to be `vana_user_id`, not a wallet address, email address, Privy id, WorkOS id, or Stytch id.

## OIDC requirement

The OIDC constraint is exact-match, not cosmetic branding. Discovery metadata `issuer` must match the issuer URL used by the relying party and the `iss` claim in ID tokens. The `sub` claim must be locally unique, never reassigned within the issuer, ASCII, and no longer than 255 characters. A Vana-generated opaque account id fits this model.

Sources:

- <https://openid.net/specs/openid-connect-discovery-1_0.html>
- <https://openid.net/specs/openid-connect-core-1_0.html>

## Ory Network / Hydra

Status: confirmed enough to keep Ory Network as the managed-issuer option for this change.

Evidence:

- Ory documents changing the OAuth2/OIDC issuer URL and recommends using the primary custom domain as that issuer.
- Ory Network supports custom domains, including Vercel-specific DNS guidance.
- Ory's custom login/consent flow lets the application accept a login request with an explicit `subject`. That gives `account.vana.org` the necessary control to use `vana_user_id` as the OIDC subject.

Sources:

- <https://www.ory.com/docs/oauth2-oidc/issuer-url>
- <https://www.ory.com/docs/guides/custom-domains>
- <https://www.ory.com/docs/oauth2-oidc/custom-login-consent/flow>

Remaining live validation:

- After configuring `account.vana.org`, verify `/.well-known/openid-configuration` reports `issuer: "https://account.vana.org"`.
- Verify ID tokens and UserInfo use the same `sub = vana_user_id` accepted during the login flow.
- Confirm any Ory Network subject format or length constraints against a live project, although the OIDC limit already bounds the intended Vana id.

## WorkOS Connect / AuthKit

Status: plausible fallback, not confirmed for this design's subject-control requirement.

Evidence:

- WorkOS documents AuthKit custom domains in production.
- WorkOS Connect exposes OIDC discovery metadata, including `issuer`, `jwks_uri`, `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint`.
- Public docs did not confirm that WorkOS Connect/AuthKit can issue ID tokens with a Vana-owned `sub` instead of a WorkOS-owned user id.

Sources:

- <https://workos.com/docs/custom-domains/authkit>
- <https://workos.com/docs/reference/workos-connect/metadata#openid-configuration>

Vendor follow-up if WorkOS stays in consideration:

- Does discovery metadata at `https://account.vana.org/.well-known/openid-configuration` report `issuer: "https://account.vana.org"` rather than a WorkOS/AuthKit hostname?
- Can every ID token and UserInfo response use `sub = vana_user_id` supplied by Vana, while retaining WorkOS user ids only as provider metadata?

## Stytch Connected Apps

Status: plausible fallback for exact issuer, not confirmed for this design's subject-control requirement.

Evidence:

- Stytch documents Connected Apps custom-domain behavior where ID-token issuer and well-known metadata are based on the domain used to access Stytch.
- Stytch explicitly frames custom domains as the path to a fully OIDC-compliant HTTPS issuer.
- Public docs did not confirm that Connected Apps can issue ID tokens with a customer-owned opaque subject instead of a Stytch-owned user or member id.

Source:

- <https://stytch.com/docs/connected-apps/resources/custom-domains>

Vendor follow-up if Stytch stays in consideration:

- Can Connected Apps discovery metadata at `https://account.vana.org/.well-known/openid-configuration` report `issuer: "https://account.vana.org"`?
- Can every ID token and UserInfo response use `sub = vana_user_id` supplied by Vana, while retaining Stytch ids only as provider metadata?

## Decision impact

Task 2.8 is satisfied for one managed issuer path because Ory Network has source-backed support for both exact issuer configuration and application-controlled subject assignment. WorkOS and Stytch remain fallback candidates only after vendor confirmation or a live POC proves both requirements.
