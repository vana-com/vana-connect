const HYDRA_PUBLIC_REWRITE_PATHS = [
  {
    source: "/.well-known/openid-configuration",
    destination: "/.well-known/openid-configuration",
  },
  {
    source: "/.well-known/jwks.json",
    destination: "/.well-known/jwks.json",
  },
  {
    source: "/oauth2/authorize",
    destination: "/oauth2/auth",
  },
  {
    source: "/oauth2/token",
    destination: "/oauth2/token",
  },
  {
    source: "/oauth2/revoke",
    destination: "/oauth2/revoke",
  },
  {
    source: "/oauth2/userinfo",
    destination: "/userinfo",
  },
  {
    source: "/userinfo",
    destination: "/userinfo",
  },
] as const;

export type HydraPublicRewrite = {
  source: string;
  destination: string;
};

export function buildHydraPublicRewrites(
  hydraPublicUrl: string | undefined,
): HydraPublicRewrite[] {
  const baseUrl = normalizeHydraPublicUrl(hydraPublicUrl);
  if (!baseUrl) return [];

  return HYDRA_PUBLIC_REWRITE_PATHS.map((route) => ({
    source: route.source,
    destination: `${baseUrl}${route.destination}`,
  }));
}

function normalizeHydraPublicUrl(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("HYDRA_PUBLIC_URL must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("HYDRA_PUBLIC_URL must use http or https");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}
