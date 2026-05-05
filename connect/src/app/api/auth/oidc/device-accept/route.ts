/**
 * POST /api/auth/oidc/device-accept
 *
 * Called from the Hydra device-grant verification page (`/auth/oidc/device`)
 * when the signed-in user clicks "Authorize". Calls Hydra admin's
 * `acceptDeviceUserCodeRequest` and returns the redirect URL so the browser
 * can navigate Hydra's continuation flow.
 *
 * Auth: requires a Vana session Bearer (state-mutating; no cookie fallback).
 *
 * Returns:
 *   200 { redirect_to: <url> } on success.
 *   400 if challenge or user_code missing.
 *   401 if not signed in.
 *   502 if Hydra rejects the accept call.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { runOidcDeviceAccept } from "@/app/auth/oidc/oidc-route-runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const session = await getVanaSession(request);
  if (!session) {
    return NextResponse.json(
      { error: { type: "authentication_error", message: "Not authenticated" } },
      { status: 401 },
    );
  }

  let body: { device_challenge?: string; user_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: { type: "invalid_request_error", message: "Invalid JSON body" },
      },
      { status: 400 },
    );
  }

  try {
    return await runOidcDeviceAccept(body);
  } catch (err) {
    console.error(
      "[api/auth/oidc/device-accept] Hydra accept failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: {
          type: "upstream_error",
          message: "Could not accept device authorization.",
        },
      },
      { status: 502 },
    );
  }
}
