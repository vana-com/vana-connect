/**
 * Vana session bootstrap (BFF).
 *
 * Browser flow:
 *   1. User signs in with Privy in the browser → receives a Privy id_token.
 *   2. Browser POSTs the id_token to this route.
 *   3. Route verifies the id_token via Privy SDK (audience-pinned to our
 *      PRIVY_APP_ID), resolves to vanaUserId (creating a vana_users row
 *      if none).
 *   4. Route drives the OAuth2 authorization-code + PKCE flow against
 *      Hydra programmatically (see hydra-headless-oidc.ts) — accepting
 *      login + consent server-side via admin API and capturing the code
 *      from Hydra's redirect chain. Exchanges the code for an opaque
 *      access_token + refresh_token.
 *   5. Refresh token is encrypted (AES-256-GCM, KEK = REFRESH_TOKEN_ENC_KEY)
 *      and persisted to vana_refresh_tokens.
 *   6. Cookies set:
 *      - `vana_session` (HttpOnly, SameSite=Lax) — the access token.
 *        Only used for GET/HEAD/OPTIONS (cookie auth on read paths).
 *      - `vana_access`  (NOT HttpOnly, SameSite=Lax) — the access token
 *        as a JS-readable companion. Browser fetch helpers send it as
 *        `Authorization: Bearer <vana_access>` for state-mutating calls.
 *   7. Returns the tokens in the JSON body too, for non-browser callers.
 *
 * DELETE on this route is the legacy logout endpoint; logout has moved to
 * /api/auth/logout (with proper tombstone-first sequencing). DELETE here
 * is kept for transitional callers and just clears cookies.
 *
 * See docs/auth-redesign/01-architecture.md §3.3, §7.1.
 */

import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  type LoginEvidence,
  type PrivyVerifiedUser,
  pickEmbeddedEvmWallet,
  pickVerifiedEmail,
} from "@/lib/auth/login-session-adapter";
import { resolveVanaUserByPrivyEvidence } from "@/lib/db/account";
import { exchangeForVanaSession } from "@/lib/auth/hydra-headless-oidc";
import { insertRefreshToken } from "@/lib/db/sessions";

export const runtime = "nodejs";

const VANA_ACCOUNT_WEB_CLIENT_ID = "vana-account-web";

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

const COOKIE_NAMES = ["vana_session", "vana_access"];

export async function POST(request: Request): Promise<Response> {
  const token = readBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: { code: "missing_identity_token" } },
      { status: 401 },
    );
  }

  // 1. Verify Privy id_token. PrivyClient is configured with our app id/secret;
  //    the SDK rejects a token issued for a different app at this layer.
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

  // 2. Resolve to vanaUserId (creating if necessary). resolveVanaUserByPrivyEvidence
  //    is idempotent and uses advisory locks so concurrent calls converge on the same row.
  let vanaUserId: string;
  try {
    const { user } = await resolveVanaUserByPrivyEvidence({
      privySubject: evidence.privySubject,
      email: evidence.email ?? null,
      embeddedWallet: evidence.embeddedWallet
        ? {
            chainType: evidence.embeddedWallet.chainType,
            address: evidence.embeddedWallet.address,
            providerWalletId: evidence.embeddedWallet.providerWalletId ?? null,
          }
        : undefined,
    });
    vanaUserId = user.id;
  } catch (err) {
    console.error(
      "[api/auth/session] resolveVanaUserByPrivyEvidence failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: { code: "vana_user_resolution_failed" } },
      { status: 500 },
    );
  }

  // 3. Drive Hydra's authorization-code + PKCE flow server-side. Returns the
  //    raw token response (access_token, refresh_token, expires_in, id_token?).
  let tokens: Awaited<ReturnType<typeof exchangeForVanaSession>>;
  try {
    tokens = await exchangeForVanaSession({
      vanaUserId,
      clientId: VANA_ACCOUNT_WEB_CLIENT_ID,
      audience: ["account.vana.org"],
      scope: ["openid", "offline"],
    });
  } catch (err) {
    console.error(
      "[api/auth/session] exchangeForVanaSession failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: { code: "hydra_session_failed" } },
      { status: 502 },
    );
  }

  // 4. Persist the refresh token, encrypted at rest.
  if (tokens.refresh_token) {
    try {
      // We don't have the Hydra session_id surfaced here directly; use the
      // access token's sha256 prefix as a fallback. The introspection
      // verifier (getVanaSession) extracts the canonical sid via Hydra.
      // TODO: thread the session_id through if the introspection contract
      // surfaces it on the immediate token-exchange response.
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await insertRefreshToken({
        vanaUserId,
        hydraSessionId: `pending_${vanaUserId.slice(-8)}_${Date.now()}`,
        refreshToken: tokens.refresh_token,
        expiresAt,
      });
    } catch (err) {
      console.warn(
        "[api/auth/session] insertRefreshToken failed (continuing)",
        err instanceof Error ? err.message : err,
      );
      // Don't fail the request; the refresh token still works in-flight,
      // we just lose server-side rotation tracking. Logged loudly for
      // attention.
    }
  }

  // 5. Set cookies + return token bundle.
  const accessTtlSec = tokens.expires_in ?? 15 * 60;
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json(
    {
      ok: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: accessTtlSec,
      token_type: "Bearer",
    },
    { status: 200 },
  );
  response.headers.set("cache-control", "no-store");
  response.cookies.set({
    name: "vana_session",
    value: tokens.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: accessTtlSec,
  });
  response.cookies.set({
    name: "vana_access",
    value: tokens.access_token,
    httpOnly: false, // client JS must read this for Bearer-on-mutation
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: accessTtlSec,
  });
  return response;
}

/**
 * Legacy logout. New code calls /api/auth/logout which writes the tombstone
 * first. This handler is kept for transitional callers and only clears
 * cookies.
 */
export async function DELETE(): Promise<Response> {
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  for (const name of COOKIE_NAMES) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: name === "vana_session",
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
