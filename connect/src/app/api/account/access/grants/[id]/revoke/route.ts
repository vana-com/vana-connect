import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revokeActionRequest } from "@/lib/db/account-actions";
import {
  buildFreshAccountAccessSummary,
  resolveAccountAccessUser,
} from "../../../_auth";
import { buildAccountAccessSummary } from "../../../summary";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const resolved = await resolveAccountAccessUser(request);
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "account_session_required" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const { id } = await context.params;
    const outcome = await revokeActionRequest({
      id,
      vanaUserId: resolved.user.id,
    });

    if (outcome.status === "not_found") {
      return NextResponse.json(
        { error: { code: "grant_not_found" } },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    if (outcome.status === "not_active") {
      return NextResponse.json(
        { error: { code: "grant_not_active" } },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    const summaryRows = await buildFreshAccountAccessSummary(resolved.user.id);
    return NextResponse.json(
      {
        ok: true,
        mode: "mock_rpc_revoke",
        revoked_count: 1,
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
