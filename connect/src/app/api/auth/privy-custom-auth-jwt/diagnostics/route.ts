import { NextResponse } from "next/server";
import { inspectVanaCustomAuthJwtConfig } from "@/lib/auth/privy-custom-auth";

export const dynamic = "force-dynamic";

function diagnosticsAllowed(): boolean {
  if (process.env.AUTH_DIAGNOSTICS_ENABLED === "true") return true;
  return process.env.VERCEL_ENV !== "production";
}

export async function GET(request: Request): Promise<Response> {
  if (!diagnosticsAllowed()) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const response = NextResponse.json({
    status: "ok",
    privyCustomAuth: {
      blockedByPlan: true,
      requiredPlan: "Scale",
      dashboardPath:
        "Integrations > Plugins > Custom authentication, then User management > Authentication > JWT-based auth",
      authEnvironment: "client-side",
      jwtIdClaim: "sub",
      jwksUrl: `${origin}/.well-known/jwks.json`,
      jwtEndpoint: `${origin}/api/auth/privy-custom-auth-jwt`,
    },
    appConfig: {
      jwtSyncEnabled:
        process.env.NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED === "true",
    },
    signer: inspectVanaCustomAuthJwtConfig(),
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
