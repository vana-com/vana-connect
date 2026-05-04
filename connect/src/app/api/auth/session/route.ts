import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  ACCOUNT_LOGIN_SESSION_COOKIE,
  ACCOUNT_LOGIN_SESSION_TTL_MS,
  createAccountLoginSessionToken,
  resolveAccountLoginSessionSecret,
} from "@/lib/auth/account-login-session";
import {
  type LoginEvidence,
  type PrivyVerifiedUser,
  pickEmbeddedEvmWallet,
  pickVerifiedEmail,
} from "@/lib/auth/login-session-adapter";

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

function readBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

async function verifyPrivyIdentityToken(
  token: string,
): Promise<PrivyVerifiedUser> {
  const user = await getPrivyClient().users().get({ id_token: token });
  return user as unknown as PrivyVerifiedUser;
}

function evidenceFromPrivyUser(user: PrivyVerifiedUser): LoginEvidence | null {
  if (!user.id) return null;
  const evidence: LoginEvidence = { privySubject: user.id };
  const email = pickVerifiedEmail(user);
  if (email) evidence.email = email;
  const wallet = pickEmbeddedEvmWallet(user);
  if (wallet) evidence.embeddedWallet = wallet;
  return evidence;
}

export async function POST(request: Request): Promise<Response> {
  const token = readBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: { code: "missing_identity_token" } },
      { status: 401 },
    );
  }

  let evidence: LoginEvidence | null = null;
  try {
    evidence = evidenceFromPrivyUser(await verifyPrivyIdentityToken(token));
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_identity_token" } },
      { status: 401 },
    );
  }

  if (!evidence) {
    return NextResponse.json(
      { error: { code: "invalid_identity_token" } },
      { status: 401 },
    );
  }

  const secret = resolveAccountLoginSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { error: { code: "session_not_configured" } },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  response.cookies.set({
    name: ACCOUNT_LOGIN_SESSION_COOKIE,
    value: createAccountLoginSessionToken(evidence, { secret }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ACCOUNT_LOGIN_SESSION_TTL_MS / 1000),
  });
  return response;
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  response.cookies.set({
    name: ACCOUNT_LOGIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
