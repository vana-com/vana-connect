/**
 * Vana session logout.
 *
 * SLVP-correct flow (post-tombstone era):
 *   1. Resolve the calling session (defensive: missing/invalid → still clear
 *      cookies and 200 so a re-logout from an expired token doesn't strand
 *      the client).
 *   2. If authenticated:
 *      a. Call Hydra admin
 *         `DELETE /admin/oauth2/auth/sessions/login?subject=<vanaUserId>`
 *         with a Google ID-token Bearer (audience = HYDRA_ADMIN_AUDIENCE).
 *         This is Ory's documented way to invalidate every Hydra session
 *         (and therefore every opaque access token issued under it) for a
 *         subject. Future introspections return active:false.
 *
 *         TODO(prod): narrow to per-session granularity via the consent
 *         endpoint once we have multiple concurrent device sessions per
 *         subject. For dev-stage cutover, subject-level revoke is acceptable.
 *      b. Drop our row in vana_active_sessions via deleteActiveSessionsBySid
 *         so the verifier 401s any access tokens that survive the
 *         per-process introspection cache.
 *      c. Hydra admin failures are logged loudly but do NOT block cookie
 *         clearing. Logout is best-effort from the user's perspective.
 *   3. Clear `vana_session` and `vana_access` cookies (matching the login
 *      route's secure/sameSite/path) and return 200.
 *
 * Notes:
 *   - No tombstone writes. The active-sessions table is the source of truth;
 *     deleting the row is the new revocation primitive.
 *   - Auth: not strictly required (we degrade gracefully on null), but if a
 *     token is present we treat it as the session-under-logout.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { fetchGoogleIdTokenForAudience } from "@/lib/auth/google-id-token";
import { deleteActiveSessionsBySid } from "@/lib/db/sessions";

export const runtime = "nodejs";

const COOKIE_NAMES = ["vana_session", "vana_access"] as const;

function clearCookies(res: NextResponse): void {
  const isProd = process.env.NODE_ENV === "production";
  for (const name of COOKIE_NAMES) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: name === "vana_session",
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 0,
    });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getVanaSession(req);

  if (session) {
    // Hydra admin DELETE — best-effort. Errors logged, do not block.
    try {
      await revokeHydraSubjectSession(session.vanaUserId);
    } catch (err) {
      console.error(
        "[logout] hydra admin revoke failed",
        err instanceof Error ? err.message : err,
      );
    }

    // Drop our active-sessions row so the verifier rejects any cached access
    // tokens that still introspect as active during the brief window before
    // Hydra's revocation propagates.
    try {
      await deleteActiveSessionsBySid(session.hydraSessionId);
    } catch (err) {
      console.error(
        "[logout] deleteActiveSessionsBySid failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("cache-control", "no-store");
  clearCookies(res);
  return res;
}

/**
 * Revoke ALL Hydra-side login sessions for the given subject. Per Ory docs,
 * this is the canonical way to invalidate every token issued under any
 * session for that subject; subsequent introspections return active:false.
 *
 * TODO(prod): if/when a single subject can have multiple concurrent device
 * sessions and we want device-scoped logout, switch to the per-session
 * consent-revoke endpoint keyed by `sid`.
 */
async function revokeHydraSubjectSession(vanaUserId: string): Promise<void> {
  const hydraAdminUrl = process.env.HYDRA_ADMIN_URL;
  if (!hydraAdminUrl) {
    throw new Error("HYDRA_ADMIN_URL is not configured");
  }
  const hydraAdminAudience = process.env.HYDRA_ADMIN_AUDIENCE ?? hydraAdminUrl;
  const adminBearer = await fetchGoogleIdTokenForAudience(hydraAdminAudience);
  const url = `${hydraAdminUrl.replace(
    /\/+$/,
    "",
  )}/admin/oauth2/auth/sessions/login?subject=${encodeURIComponent(vanaUserId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...(adminBearer ? { authorization: `Bearer ${adminBearer}` } : {}),
    },
  });
  if (!response.ok && response.status !== 404) {
    // 404 is treated as success: nothing to revoke. Other non-2xx is loud.
    throw new Error(
      `Hydra admin DELETE returned ${response.status}: ${await safeReadBody(response)}`,
    );
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 512);
  } catch {
    return "<unreadable>";
  }
}
