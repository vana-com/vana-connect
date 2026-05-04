import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  createPrivyLoginSessionAdapter,
  type PrivyVerifiedUser,
} from "@/lib/auth/login-session-adapter";
import {
  createVanaCustomAuthJwt,
  inspectVanaCustomAuthJwtConfig,
  resolveVanaCustomAuthJwtConfig,
} from "@/lib/auth/privy-custom-auth";
import { resolveVanaUserByPrivyEvidence } from "@/lib/db/account";

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        "Privy verification is not configured (PRIVY_APP_ID and PRIVY_APP_SECRET)",
      );
    }
    privyClient = new PrivyClient({
      appId,
      appSecret,
      jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY,
    });
  }
  return privyClient;
}

async function verifyPrivyIdentityToken(
  token: string,
): Promise<PrivyVerifiedUser> {
  const user = await getPrivyClient().users().get({ id_token: token });
  return user as unknown as PrivyVerifiedUser;
}

function json(body: unknown, init?: ResponseInit): Response {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const loginSessionAdapter = createPrivyLoginSessionAdapter({
    verifyIdentityToken: verifyPrivyIdentityToken,
  });

  const evidence = await loginSessionAdapter.resolveLoginEvidence(request);
  if (!evidence) {
    return json({ error: { code: "not_authenticated" } }, { status: 401 });
  }

  let vanaUserId: string;
  try {
    const { user } = await resolveVanaUserByPrivyEvidence(evidence);
    vanaUserId = user.id;
  } catch {
    return json(
      { error: { code: "account_resolution_failed" } },
      { status: 500 },
    );
  }

  const inspection = inspectVanaCustomAuthJwtConfig();
  if (!inspection.ready) {
    return json({ error: { code: "jwt_not_configured" } }, { status: 500 });
  }

  try {
    const config = resolveVanaCustomAuthJwtConfig();
    return json({
      token: createVanaCustomAuthJwt({
        vanaUserId,
        config,
      }),
    });
  } catch {
    return json({ error: { code: "jwt_signing_failed" } }, { status: 500 });
  }
}
