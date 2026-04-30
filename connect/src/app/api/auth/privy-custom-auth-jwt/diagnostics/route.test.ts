import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/auth/privy-custom-auth", () => ({
  inspectVanaCustomAuthJwtConfig: () => ({
    ready: true,
    missing: [],
    keyId: "test-key-1",
    issuer: "https://account-dev.vana.org",
    audience: "privy-app-id",
    publicKeyReady: true,
  }),
}));

describe("GET /api/auth/privy-custom-auth-jwt/diagnostics", () => {
  it("returns non-secret custom-auth readiness details outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED", "false");

    const response = await GET(
      new Request(
        "https://account-dev.vana.org/api/auth/privy-custom-auth-jwt/diagnostics",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "ok",
      privyCustomAuth: {
        blockedByPlan: true,
        requiredPlan: "Scale",
        dashboardPath:
          "Integrations > Plugins > Custom authentication, then User management > Authentication > JWT-based auth",
        authEnvironment: "client-side",
        jwtIdClaim: "sub",
        jwksUrl: "https://account-dev.vana.org/.well-known/jwks.json",
        jwtEndpoint:
          "https://account-dev.vana.org/api/auth/privy-custom-auth-jwt",
      },
      appConfig: { jwtSyncEnabled: false },
      signer: {
        ready: true,
        missing: [],
        keyId: "test-key-1",
        issuer: "https://account-dev.vana.org",
        audience: "privy-app-id",
        publicKeyReady: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
  });

  it("is hidden in production unless explicitly enabled", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AUTH_DIAGNOSTICS_ENABLED", "false");

    const response = await GET(
      new Request(
        "https://account.vana.org/api/auth/privy-custom-auth-jwt/diagnostics",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("can be explicitly enabled in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AUTH_DIAGNOSTICS_ENABLED", "true");

    const response = await GET(
      new Request(
        "https://account.vana.org/api/auth/privy-custom-auth-jwt/diagnostics",
      ),
    );

    expect(response.status).toBe(200);
  });
});
