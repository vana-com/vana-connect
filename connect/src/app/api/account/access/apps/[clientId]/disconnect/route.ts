import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revokeActionRequestsForClient } from "@/lib/db/account-actions";
import {
  buildFreshAccountAccessSummary,
  resolveAccountAccessUser,
} from "../../../_auth";
import { buildAccountAccessSummary } from "../../../summary";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const resolved = await resolveAccountAccessUser(request);
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "account_session_required" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const { clientId } = await context.params;
    const outcome = await revokeActionRequestsForClient({
      clientId,
      vanaUserId: resolved.user.id,
    });

    if (!outcome.appFound) {
      return NextResponse.json(
        { error: { code: "app_not_found" } },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const summaryRows = await buildFreshAccountAccessSummary(resolved.user.id);
    return NextResponse.json(
      {
        ok: true,
        mode: "mock_rpc_revoke",
        revoked_count: outcome.revokedCount,
        summary: buildAccountAccessSummary({
          user: resolved.user,
          ...summaryRows,
        }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "revoke_failed" } },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
