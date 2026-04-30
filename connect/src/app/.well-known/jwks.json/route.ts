import { NextResponse } from "next/server";
import {
  buildVanaCustomAuthJwks,
  resolveVanaCustomAuthJwtConfig,
} from "@/lib/auth/privy-custom-auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const config = resolveVanaCustomAuthJwtConfig();
    const response = NextResponse.json(
      buildVanaCustomAuthJwks({
        privateKeyPem: config.privateKeyPem,
        keyId: config.keyId,
      }),
    );
    response.headers.set("cache-control", "public, max-age=300");
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "jwks_not_configured" } },
      { status: 500 },
    );
  }
}
