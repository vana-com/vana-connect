import { isVanaUserId } from "./vana-account";

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
  grantAccessTokenAudience?: string[];
  grantScope: string[];
  remember?: boolean;
  rememberForSeconds?: number;
  subject: string;
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

export function createHydraAdminClient({
  adminUrl = getHydraAdminUrl(),
  fetch: fetchImpl = fetch,
}: {
  adminUrl?: string;
  fetch?: HydraFetch;
} = {}) {
  const baseUrl = normalizeBaseUrl(adminUrl);

  return {
    acceptConsentRequest(
      consentChallenge: string,
      input: AcceptHydraConsentRequest,
    ) {
      assertVanaUserId(input.subject);

      return request<HydraRedirectResponse>({
        baseUrl,
        body: {
          grant_access_token_audience: input.grantAccessTokenAudience ?? [],
          grant_scope: input.grantScope,
          remember: input.remember ?? false,
          remember_for: input.rememberForSeconds ?? 0,
          session: buildHydraSessionClaims(input.subject),
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

export function buildHydraSessionClaims(vanaUserId: string) {
  assertVanaUserId(vanaUserId);
  return {
    id_token: {
      vana_user_id: vanaUserId,
    },
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
  baseUrl,
  body,
  fetchImpl,
  method,
  path,
}: {
  baseUrl: string;
  body?: JsonObject;
  fetchImpl: HydraFetch;
  method: string;
  path: string;
}): Promise<T> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      accept: "application/json",
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
