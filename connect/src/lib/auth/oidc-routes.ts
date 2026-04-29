/**
 * Pure handler logic for the Hydra OIDC login/consent routes.
 *
 * The App Router `route.ts` files wire production deps (Hydra admin client,
 * login session adapter) and call into these handlers. Tests inject fake deps
 * directly so they don't need a running Next.js server, Hydra, or Privy.
 *
 * Routes are intentionally namespaced under `/auth/oidc/*` so they cannot be
 * confused with the existing `/login` and `/connect` compatibility surfaces.
 */

import type {
  AcceptHydraConsentRequest,
  AcceptHydraLoginRequest,
  HydraConsentRequest,
  HydraLoginRequest,
  HydraRedirectResponse,
} from "./hydra-admin";
import type {
  LoginEvidence,
  LoginSessionAdapter,
} from "./login-session-adapter";
import {
  createDefaultOauthClientRegistry,
  evaluateConsentPolicy,
  type OauthClientRegistry,
} from "./oauth-client-policy";

export const OIDC_LOGIN_PATH = "/auth/oidc/login";
export const OIDC_CONSENT_PATH = "/auth/oidc/consent";
export const LOGIN_PATH = "/login";

export type HydraAdminClientForOidc = {
  getLoginRequest(challenge: string): Promise<HydraLoginRequest>;
  acceptLoginRequest(
    challenge: string,
    input: AcceptHydraLoginRequest,
  ): Promise<HydraRedirectResponse>;
  getConsentRequest(challenge: string): Promise<HydraConsentRequest>;
  acceptConsentRequest(
    challenge: string,
    input: AcceptHydraConsentRequest,
  ): Promise<HydraRedirectResponse>;
};

export type ResolveVanaUser = (
  input: LoginEvidence,
) => Promise<{ user: { id: string }; created: boolean }>;

export type OidcRouteResult =
  | { kind: "redirect"; status: 302 | 303; location: string }
  | { kind: "error"; status: 400; message: string };

/**
 * Build the URL the user should land on if they need to sign in before the
 * OIDC login challenge can be processed. The challenge is preserved as
 * `?return_to=/auth/oidc/login?login_challenge=…` so `/login` can finish and
 * send the user back to the same Hydra challenge.
 */
export function buildLoginRedirectForOidcChallenge(
  loginChallenge: string,
): string {
  const oidcLoginUrl = `${OIDC_LOGIN_PATH}?login_challenge=${encodeURIComponent(loginChallenge)}`;
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(oidcLoginUrl)}`;
}

/**
 * Validate a `return_to` query parameter on `/login` against the OIDC route
 * namespace. We only allow same-origin paths under `/auth/oidc/` to avoid
 * `/login` becoming an open redirect.
 */
export function isSafeOidcReturnTo(
  returnTo: string | null,
): returnTo is string {
  if (!returnTo) return false;
  if (!returnTo.startsWith("/auth/oidc/")) return false;
  // Block protocol-relative and CRLF tricks.
  if (returnTo.startsWith("//")) return false;
  if (/[\r\n]/.test(returnTo)) return false;
  return true;
}

export type HandleOidcLoginInput = {
  loginChallenge: string | null;
  hydra: HydraAdminClientForOidc;
  sessionAdapter: LoginSessionAdapter;
  resolveVanaUser: ResolveVanaUser;
  request: Request;
};

export async function handleOidcLogin(
  input: HandleOidcLoginInput,
): Promise<OidcRouteResult> {
  const challenge = input.loginChallenge?.trim();
  if (!challenge) {
    return {
      kind: "error",
      status: 400,
      message: "Missing required login_challenge",
    };
  }

  // Inspect the Hydra login request. Even when Hydra says `skip: true`, we
  // still resolve the current Vana user so we never trust Hydra's cached
  // subject blindly.
  await input.hydra.getLoginRequest(challenge);

  const evidence = await input.sessionAdapter.resolveLoginEvidence(
    input.request,
  );
  if (!evidence) {
    return {
      kind: "redirect",
      status: 303,
      location: buildLoginRedirectForOidcChallenge(challenge),
    };
  }

  const { user } = await input.resolveVanaUser(evidence);

  const accepted = await input.hydra.acceptLoginRequest(challenge, {
    subject: user.id,
  });

  return { kind: "redirect", status: 303, location: accepted.redirect_to };
}

export type HandleOidcConsentInput = {
  consentChallenge: string | null;
  hydra: HydraAdminClientForOidc;
  /**
   * Optional client registry override. Defaults to the static first-slice
   * registry built by {@link createDefaultOauthClientRegistry}.
   */
  clientRegistry?: OauthClientRegistry;
};

export async function handleOidcConsent(
  input: HandleOidcConsentInput,
): Promise<OidcRouteResult> {
  const challenge = input.consentChallenge?.trim();
  if (!challenge) {
    return {
      kind: "error",
      status: 400,
      message: "Missing required consent_challenge",
    };
  }

  const consentRequest = await input.hydra.getConsentRequest(challenge);
  const registry = input.clientRegistry ?? createDefaultOauthClientRegistry();

  const decision = evaluateConsentPolicy({
    registry,
    clientId: consentRequest.client?.client_id,
    requestedScope: consentRequest.requested_scope,
    requestedAudience: consentRequest.requested_access_token_audience,
  });

  if (decision.kind === "deny") {
    return { kind: "error", status: 400, message: decision.message };
  }

  const accepted = await input.hydra.acceptConsentRequest(challenge, {
    grantScope: decision.grantScope,
    grantAccessTokenAudience: decision.grantAudience,
    subject: consentRequest.subject,
  });

  return { kind: "redirect", status: 303, location: accepted.redirect_to };
}
