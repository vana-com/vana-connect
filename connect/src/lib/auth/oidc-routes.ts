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
  HydraSessionClaimInput,
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
import { isVanaUserId } from "./vana-account";

export const OIDC_LOGIN_PATH = "/auth/oidc/login";
export const OIDC_CONSENT_PATH = "/auth/oidc/consent";
export const OIDC_LOGOUT_PATH = "/auth/oidc/logout";
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
  acceptDeviceUserCodeRequest(
    deviceChallenge: string,
    input: { userCode: string },
  ): Promise<HydraRedirectResponse>;
  acceptLogoutRequest(challenge: string): Promise<HydraRedirectResponse>;
};

export type ResolveVanaUser = (
  input: LoginEvidence,
) => Promise<{ user: { id: string }; created: boolean }>;

export type LoadOidcAccountClaims = (
  vanaUserId: string,
) => Promise<Pick<HydraSessionClaimInput, "email" | "linkedWallets">>;

export type OidcRouteResult =
  | { kind: "redirect"; status: 302 | 303; location: string }
  | { kind: "error"; status: 400 | 502; message: string };

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
  if (!isVanaUserId(user.id)) {
    return {
      kind: "error",
      status: 400,
      message: "Resolved OIDC subject must be an opaque vana_user_id",
    };
  }

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
  /**
   * Optional account-claim loader used to populate Hydra session claims.
   * Without it, consent still grants `sub = vana_user_id` plus the
   * non-standard `vana_user_id` claim, but no wallet/email claims.
   */
  loadAccountClaims?: LoadOidcAccountClaims;
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
  if (!isVanaUserId(consentRequest.subject)) {
    return {
      kind: "error",
      status: 400,
      message: "Hydra consent subject must be an opaque vana_user_id",
    };
  }

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

  const accountClaims = input.loadAccountClaims
    ? await input.loadAccountClaims(consentRequest.subject)
    : undefined;

  const accepted = await input.hydra.acceptConsentRequest(challenge, {
    grantScope: decision.grantScope,
    grantAccessTokenAudience: decision.grantAudience,
    subject: consentRequest.subject,
    ...(accountClaims ? { accountClaims } : {}),
  });

  return { kind: "redirect", status: 303, location: accepted.redirect_to };
}

/**
 * Handle the POST that fires when the signed-in user clicks "Authorize this
 * device" on the verification page (`/auth/oidc/device`). Calls Hydra admin's
 * `acceptDeviceUserCodeRequest`. The redirect_to from Hydra typically points
 * back into the OAuth authorize endpoint (`/oauth2/auth?…&login_verifier=…`),
 * which re-enters this app's `/auth/oidc/login` and `/auth/oidc/consent`
 * with the user already signed in.
 *
 * The verification page itself is a client-side React page that gates the
 * Authorize button on Privy/Vana auth state and POSTs here. We don't render
 * the page server-side, so no `handleOidcDeviceVerification` is needed —
 * the page imports `usePrivy()` and drives sign-in directly.
 */
export type HandleOidcDeviceAcceptInput = {
  deviceChallenge: string | null;
  userCode: string | null;
  hydra: HydraAdminClientForOidc;
};

export type HandleOidcLogoutInput = {
  logoutChallenge: string | null;
  hydra: Pick<HydraAdminClientForOidc, "acceptLogoutRequest">;
};

/**
 * Accept a Hydra OIDC logout challenge and forward the user to Hydra's
 * `redirect_to`. Hydra has already validated the id_token_hint and any
 * post_logout_redirect_uri before issuing the challenge, so there is no
 * additional consent screen to render here — we just rubber-stamp it.
 *
 * Network/non-2xx failures from Hydra surface as a 502 to the caller; we do
 * not leak Hydra error bodies into the response.
 */
export async function handleOidcLogout(
  input: HandleOidcLogoutInput,
): Promise<OidcRouteResult> {
  const challenge = input.logoutChallenge?.trim();
  if (!challenge) {
    return {
      kind: "error",
      status: 400,
      message: "Missing required logout_challenge",
    };
  }

  let accepted: HydraRedirectResponse;
  try {
    accepted = await input.hydra.acceptLogoutRequest(challenge);
  } catch {
    return {
      kind: "error",
      status: 502,
      message: "Logout could not be processed",
    };
  }

  return { kind: "redirect", status: 303, location: accepted.redirect_to };
}

export async function handleOidcDeviceAccept(
  input: HandleOidcDeviceAcceptInput,
): Promise<OidcRouteResult> {
  const deviceChallenge = input.deviceChallenge?.trim();
  const userCode = input.userCode?.trim();
  if (!deviceChallenge) {
    return {
      kind: "error",
      status: 400,
      message: "Missing required device_challenge",
    };
  }
  if (!userCode) {
    return {
      kind: "error",
      status: 400,
      message: "Missing required user_code",
    };
  }

  const accepted = await input.hydra.acceptDeviceUserCodeRequest(
    deviceChallenge,
    { userCode },
  );

  return { kind: "redirect", status: 303, location: accepted.redirect_to };
}
