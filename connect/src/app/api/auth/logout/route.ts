/**
 * Vana session logout.
 *
 * See docs/auth-redesign/01-architecture.md §1.7 logout sequence.
 *
 * Fail-closed ordering:
 *   1. INSERT vana_session_tombstones row — DB write, multi-lambda visible.
 *      This is the security boundary: if subsequent steps fail, the tombstone
 *      alone still rejects future requests within ≤30s of cache TTL.
 *   2. Clear vana_session and vana_access cookies.
 *   3. POST Hydra /oauth2/revoke for refresh token (best-effort).
 *   4. POST Hydra /oauth2/sessions/logout (best-effort).
 *   5. UPDATE vana_refresh_tokens SET revoked_at = now() for the session.
 *
 * Steps 3-4 retried by background job on failure (TODO: stage 3.6 follow-up
 * to wire that up; for now they fire and forget with logging).
 *
 * Auth: Bearer required (state-mutating).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { fetchGoogleIdTokenForAudience } from "@/lib/auth/google-id-token";
import {
  insertTombstone,
  revokeRefreshTokensForSession,
} from "@/lib/db/sessions";

export const runtime = "nodejs";

const COOKIE_NAMES = ["vana_session", "vana_access"];

function clearedCookieAttrs(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: false, // overridden per-cookie
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export async function POST(req: NextRequest) {
  const session = await getVanaSession(req);
  if (!session) {
    // Even on 401 we still clear cookies — defense in depth for the
    // "stale cookie kept around" case.
    const res = NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
    for (const name of COOKIE_NAMES) {
      res.cookies.set(name, "", { ...clearedCookieAttrs(), httpOnly: true });
    }
    return res;
  }

  // Step 1: tombstone first. This is the security boundary.
  try {
    await insertTombstone({
      hydraSessionId: session.hydraSessionId,
      vanaUserId: session.vanaUserId,
    });
  } catch (err) {
    // Tombstone insert failure is rare but security-critical. Surface it.
    console.error(
      "[logout] tombstone insert failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "Logout failed" },
      { status: 500 },
    );
  }

  // Step 5 (DB-side, ordered before Hydra so we hold the consistent state):
  // mark refresh tokens revoked. Best-effort — failure here doesn't block
  // logout because the tombstone is already in place.
  try {
    await revokeRefreshTokensForSession(session.hydraSessionId);
  } catch (err) {
    console.warn(
      "[logout] revokeRefreshTokensForSession failed",
      err instanceof Error ? err.message : err,
    );
  }

  // Step 3: revoke refresh token at Hydra (best-effort). We don't have the
  // raw refresh token here without DB lookup; the route caller could pass it,
  // but the standard logout path is "user clicks logout in account.vana.org"
  // which has the cookies but not the raw refresh token. So we rely on
  // Hydra's session-end and the DB-side revocation above.
  // Best-effort kicked off but fire-and-forget.
  void revokeRefreshAtHydra(session).catch((err) =>
    console.warn(
      "[logout] hydra revoke failed",
      err instanceof Error ? err.message : err,
    ),
  );

  // Step 4: end Hydra SSO session (best-effort).
  void endHydraSession(session).catch((err) =>
    console.warn(
      "[logout] hydra session-end failed",
      err instanceof Error ? err.message : err,
    ),
  );

  // Step 2: clear cookies.
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set("vana_session", "", {
    ...clearedCookieAttrs(),
    httpOnly: true,
  });
  res.cookies.set("vana_access", "", {
    ...clearedCookieAttrs(),
    httpOnly: false,
  });
  return res;
}

async function revokeRefreshAtHydra(session: {
  vanaUserId: string;
  hydraSessionId: string;
}): Promise<void> {
  // We don't have the raw refresh token in this context. Hydra's
  // admin endpoint can revoke by consent session id which is what we
  // store as hydra_session_id. Use admin DELETE
  // /admin/oauth2/auth/sessions/login?subject=<sub> to invalidate the
  // login session, OR /admin/oauth2/auth/sessions/consent to drop
  // outstanding consents.
  const hydraAdminUrl = process.env.HYDRA_ADMIN_URL;
  if (!hydraAdminUrl) return;
  const hydraAdminAudience = process.env.HYDRA_ADMIN_AUDIENCE ?? hydraAdminUrl;
  const adminBearer = await fetchGoogleIdTokenForAudience(hydraAdminAudience);
  const url = `${hydraAdminUrl.replace(
    /\/+$/,
    "",
  )}/admin/oauth2/auth/sessions/login?subject=${encodeURIComponent(
    session.vanaUserId,
  )}`;
  await fetch(url, {
    method: "DELETE",
    headers: {
      ...(adminBearer ? { authorization: `Bearer ${adminBearer}` } : {}),
    },
  });
}

async function endHydraSession(session: { vanaUserId: string }): Promise<void> {
  // The standard end-session endpoint is on the public Hydra URL and
  // requires id_token_hint, which we don't have here. The admin-driven
  // session deletion above achieves the same effective result for
  // server-side SSO state. Public end-session is a best-effort browser
  // redirect that's better handled by the client logout flow.
  void session; // mark used; no-op for now.
}
