/**
 * Interactive confirmation consume endpoint.
 *
 * See docs/auth-redesign/01-architecture.md §6.7.
 *
 * POST /api/auth/confirmations/:id/consume
 *
 * Marks the row consumed via a single atomic UPDATE that scopes by
 * vana_user_id and hydra_session_id. The SQL statement is the entire
 * mutex; no application-level locking.
 *
 * On success, the data-connect client retries the original signing route
 * with the `x-vana-confirmation-id` header. This route does NOT call
 * wallet.signTypedData — that happens in the retried route.
 *
 * Auth: getVanaSession with Bearer (state-mutating; cookie auth rejected
 * by the verifier on POST).
 *
 * 409 is returned for already-consumed, expired, or any session mismatch
 * (defense in depth — we don't distinguish between them).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { consumeConfirmation } from "@/lib/db/auth-signing";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVanaSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await consumeConfirmation({
    id,
    vanaUserId: session.vanaUserId,
    hydraSessionId: session.hydraSessionId,
  });

  if (!row) {
    return NextResponse.json(
      { error: "already_consumed_or_expired" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
