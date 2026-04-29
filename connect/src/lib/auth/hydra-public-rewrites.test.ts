import { describe, expect, it } from "vitest";
import { buildHydraPublicRewrites } from "./hydra-public-rewrites";

describe("buildHydraPublicRewrites", () => {
  it("returns no rewrites when HYDRA_PUBLIC_URL is unset", () => {
    expect(buildHydraPublicRewrites(undefined)).toEqual([]);
    expect(buildHydraPublicRewrites("  ")).toEqual([]);
  });

  it("maps account-domain OIDC paths to the configured Hydra public URL", () => {
    expect(
      buildHydraPublicRewrites("https://hydra-public.example.com/"),
    ).toEqual([
      {
        source: "/.well-known/openid-configuration",
        destination:
          "https://hydra-public.example.com/.well-known/openid-configuration",
      },
      {
        source: "/.well-known/jwks.json",
        destination: "https://hydra-public.example.com/.well-known/jwks.json",
      },
      {
        source: "/oauth2/authorize",
        destination: "https://hydra-public.example.com/oauth2/auth",
      },
      {
        source: "/oauth2/token",
        destination: "https://hydra-public.example.com/oauth2/token",
      },
      {
        source: "/oauth2/revoke",
        destination: "https://hydra-public.example.com/oauth2/revoke",
      },
      {
        source: "/oauth2/userinfo",
        destination: "https://hydra-public.example.com/userinfo",
      },
      {
        source: "/userinfo",
        destination: "https://hydra-public.example.com/userinfo",
      },
    ]);
  });

  it("rejects malformed and non-http URLs", () => {
    expect(() => buildHydraPublicRewrites("not a url")).toThrow("absolute URL");
    expect(() => buildHydraPublicRewrites("ftp://hydra.example.com")).toThrow(
      "http or https",
    );
  });
});
