/**
 * Interactive confirmation status endpoint.
 *
 * See docs/auth-redesign/01-architecture.md §6.6.
 *
 * GET /api/auth/confirmations/:id/status
 *
 * Read-only state lookup polled by data-connect every ~2s while the user
 * decides whether to confirm a HIGH_RISK_PURPOSES action. Consumption is
 * the separate /consume POST.
 *
 * Auth: getVanaSession (Bearer or cookie on GET, per the verifier contract).
 *
 * 404 is returned both for unknown ids and for ids that belong to a
 * different vana_user_id, to avoid disclosing existence to other sessions.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { findConfirmationById } from "@/lib/db/auth-signing";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVanaSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findConfirmationById(id);
  if (!row || row.vana_user_id !== session.vanaUserId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = Date.now();
  const expiresAtMs = new Date(row.expires_at).getTime();

  if (row.consumed_at !== null) {
    return NextResponse.json({ status: "confirmed" }, { status: 200 });
  }
  if (expiresAtMs > now) {
    return NextResponse.json(
      { status: "pending", expires_at: row.expires_at },
      { status: 200 },
    );
  }
  return NextResponse.json({ status: "expired" }, { status: 200 });
}
