import { fetchGoogleIdTokenForAudience } from "./google-id-token";
import {
  buildAccountClaims,
  isVanaUserId,
  type LinkedWalletInput,
  type VanaAccountClaims,
} from "./vana-account";

type JsonObject = Record<string, unknown>;

export type HydraFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type HydraClientMetadata = {
  client_id?: string;
  client_name?: string;
};

export type HydraLoginRequest = {
  client?: HydraClientMetadata;
  requested_scope?: string[];
  skip?: boolean;
  subject?: string;
};

export type HydraConsentRequest = {
  client?: HydraClientMetadata;
  requested_access_token_audience?: string[];
  requested_scope?: string[];
  skip?: boolean;
  subject: string;
};

export type HydraRedirectResponse = {
  redirect_to: string;
};

export type AcceptHydraLoginRequest = {
  subject: string;
  remember?: boolean;
  rememberForSeconds?: number;
};

export type AcceptHydraConsentRequest = {
  accountClaims?: {
    email?: string | null;
    linkedWallets?: HydraSessionClaimInput["linkedWallets"];
  };
  grantAccessTokenAudience?: string[];
  grantScope: string[];
  remember?: boolean;
  rememberForSeconds?: number;
  subject: string;
};

export type HydraSessionClaimInput = {
  vanaUserId: string;
  linkedWallets?: Array<
    Pick<LinkedWalletInput, "address" | "chainType" | "provider"> & {
      isPrimary?: boolean;
    }
  >;
  email?: string | null;
};

export type HydraSessionClaims = {
  id_token: {
    email?: string;
    linked_wallets?: VanaAccountClaims["linked_wallets"];
    vana_user_id: string;
  };
};

export class HydraAdminError extends Error {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly status: number;

  constructor({
    body,
    method,
    path,
    status,
  }: {
    body: unknown;
    method: string;
    path: string;
    status: number;
  }) {
    super(`Hydra admin ${method} ${path} failed with ${status}`);
    this.name = "HydraAdminError";
    this.body = body;
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

export function getHydraAdminUrl() {
  const url = process.env.HYDRA_ADMIN_URL?.trim();
  if (!url) {
    throw new Error("HYDRA_ADMIN_URL is required");
  }
  return url;
}

export function getHydraAdminAudience() {
  return process.env.HYDRA_ADMIN_AUDIENCE?.trim() || undefined;
}

export function createHydraAdminClient({
  adminAudience = getHydraAdminAudience(),
  adminUrl = getHydraAdminUrl(),
  fetch: fetchImpl = fetch,
}: {
  adminAudience?: string;
  adminUrl?: string;
  fetch?: HydraFetch;
} = {}) {
  const baseUrl = normalizeBaseUrl(adminUrl);
  const audience = adminAudience ? normalizeBaseUrl(adminAudience) : baseUrl;

  return {
    acceptConsentRequest(
      consentChallenge: string,
      input: AcceptHydraConsentRequest,
    ) {
      assertVanaUserId(input.subject);

      return request<HydraRedirectResponse>({
        audience,
        baseUrl,
        body: {
          grant_access_token_audience: input.grantAccessTokenAudience ?? [],
          grant_scope: input.grantScope,
          remember: input.remember ?? false,
          remember_for: input.rememberForSeconds ?? 0,
          session: buildHydraSessionClaims({
            vanaUserId: input.subject,
            email: input.accountClaims?.email,
            linkedWallets: input.accountClaims?.linkedWallets,
          }),
        },
        fetchImpl,
        method: "PUT",
        path: `/admin/oauth2/auth/requests/consent/accept?consent_challenge=${encodeURIComponent(
          consentChallenge,
        )}`,
      });
    },

    acceptConsentRequestWithRequestedGrant(
      consentChallenge: string,
      consentRequest: HydraConsentRequest,
      options: {
        remember?: boolean;
        rememberForSeconds?: number;
      } = {},
    ) {
      return this.acceptConsentRequest(consentChallenge, {
        grantAccessTokenAudience:
          consentRequest.requested_access_token_audience ?? [],
        grantScope: consentRequest.requested_scope ?? [],
        remember: options.remember,
        rememberForSeconds: options.rememberForSeconds,
        subject: consentRequest.subject,
      });
    },

    acceptLoginRequest(loginChallenge: string, input: AcceptHydraLoginRequest) {
      assertVanaUserId(input.subject);

      return request<HydraRedirectResponse>({
        audience,
        baseUrl,
        body: {
          remember: input.remember ?? false,
          remember_for: input.rememberForSeconds ?? 0,
          subject: input.subject,
        },
        fetchImpl,
        method: "PUT",
        path: `/admin/oauth2/auth/requests/login/accept?login_challenge=${encodeURIComponent(
          loginChallenge,
        )}`,
      });
    },

    acceptLogoutRequest(logoutChallenge: string) {
      return request<HydraRedirectResponse>({
        audience,
        baseUrl,
        fetchImpl,
        method: "PUT",
        path: `/admin/oauth2/auth/requests/logout/accept?logout_challenge=${encodeURIComponent(
          logoutChallenge,
        )}`,
      });
    },

    getConsentRequest(consentChallenge: string) {
      return request<HydraConsentRequest>({
        audience,
        baseUrl,
        fetchImpl,
        method: "GET",
        path: `/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(
          consentChallenge,
        )}`,
      });
    },

    getLoginRequest(loginChallenge: string) {
      return request<HydraLoginRequest>({
        audience,
        baseUrl,
        fetchImpl,
        method: "GET",
        path: `/admin/oauth2/auth/requests/login?login_challenge=${encodeURIComponent(
          loginChallenge,
        )}`,
      });
    },
  };
}

export function buildHydraSessionClaims(
  input: string | HydraSessionClaimInput,
): HydraSessionClaims {
  const claimInput =
    typeof input === "string"
      ? { vanaUserId: input, linkedWallets: [] }
      : input;
  const accountClaims = buildAccountClaims({
    vanaUserId: claimInput.vanaUserId,
    linkedWallets: claimInput.linkedWallets ?? [],
    email: claimInput.email,
  });
  const idToken: HydraSessionClaims["id_token"] = {
    vana_user_id: accountClaims.sub,
  };
  if (accountClaims.email) {
    idToken.email = accountClaims.email;
  }
  if (accountClaims.linked_wallets.length > 0) {
    idToken.linked_wallets = accountClaims.linked_wallets;
  }
  return {
    id_token: idToken,
  };
}

function assertVanaUserId(value: string) {
  if (!isVanaUserId(value)) {
    throw new Error("Hydra OIDC subject must be an opaque vana_user_id");
  }
}

function normalizeBaseUrl(url: string) {
  const normalized = url.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("HYDRA_ADMIN_URL is required");
  }
  return normalized;
}

async function parseHydraResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { raw: text };
  }
}

async function request<T>({
  audience,
  baseUrl,
  body,
  fetchImpl,
  method,
  path,
}: {
  audience: string;
  baseUrl: string;
  body?: JsonObject;
  fetchImpl: HydraFetch;
  method: string;
  path: string;
}): Promise<T> {
  const token = await fetchGoogleIdTokenForAudience(audience, {
    fetch: fetchImpl,
  });
  const response = await fetchImpl(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    method,
  });
  const parsed = await parseHydraResponse(response);

  if (!response.ok) {
    throw new HydraAdminError({
      body: parsed,
      method,
      path,
      status: response.status,
    });
  }

  return parsed as T;
}
