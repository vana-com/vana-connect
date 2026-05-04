import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildFreshAccountAccessSummary,
  resolveAccountAccessUser,
} from "./_auth";
import { buildAccountAccessSummary } from "./summary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const resolved = await resolveAccountAccessUser(request);
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "account_session_required" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const summaryRows = await buildFreshAccountAccessSummary(resolved.user.id);

  return NextResponse.json(
    buildAccountAccessSummary({
      user: resolved.user,
      ...summaryRows,
    }),
    { headers: { "cache-control": "no-store" } },
  );
}
