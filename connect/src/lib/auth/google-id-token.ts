import crypto from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

type TokenResponse = {
  id_token?: string;
};

let cachedToken:
  | {
      audience: string;
      expiresAtMs: number;
      token: string;
    }
  | undefined;

export function clearGoogleIdTokenCacheForTests() {
  cachedToken = undefined;
}

export function getServiceAccountKeyFromEnv(
  raw = process.env.GCP_SERVICE_ACCOUNT_KEY,
): ServiceAccountKey | null {
  if (!raw) return null;

  try {
    return parseServiceAccountKey(raw);
  } catch {
    return parseServiceAccountKey(Buffer.from(raw, "base64").toString("utf-8"));
  }
}

export async function fetchGoogleIdTokenForAudience(
  audience: string,
  options: {
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
    now?: Date;
    serviceAccountKey?: ServiceAccountKey | null;
  } = {},
): Promise<string | null> {
  const serviceAccountKey =
    options.serviceAccountKey ?? getServiceAccountKeyFromEnv();
  if (!serviceAccountKey) return null;

  const now = options.now ?? new Date();
  if (
    cachedToken &&
    cachedToken.audience === audience &&
    cachedToken.expiresAtMs > now.getTime() + 60_000
  ) {
    return cachedToken.token;
  }

  const expiresAtSeconds = Math.floor(now.getTime() / 1000) + 3600;
  const assertion = createSignedJwt({
    audience,
    expiresAtSeconds,
    issuedAtSeconds: Math.floor(now.getTime() / 1000),
    serviceAccountKey,
  });

  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Google ID token exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as TokenResponse;
  if (!payload.id_token) {
    throw new Error("Google ID token exchange returned no id_token");
  }

  cachedToken = {
    audience,
    expiresAtMs: expiresAtSeconds * 1000,
    token: payload.id_token,
  };
  return payload.id_token;
}

function parseServiceAccountKey(raw: string): ServiceAccountKey {
  const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GCP_SERVICE_ACCOUNT_KEY is missing client_email/private_key",
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

function createSignedJwt({
  audience,
  expiresAtSeconds,
  issuedAtSeconds,
  serviceAccountKey,
}: {
  audience: string;
  expiresAtSeconds: number;
  issuedAtSeconds: number;
  serviceAccountKey: ServiceAccountKey;
}) {
  const header = base64UrlJson({
    alg: "RS256",
    typ: "JWT",
  });
  const claims = base64UrlJson({
    aud: GOOGLE_TOKEN_URL,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    iss: serviceAccountKey.client_email,
    sub: serviceAccountKey.client_email,
    target_audience: audience,
  });
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(serviceAccountKey.private_key, "base64url");

  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
