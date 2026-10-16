import { NextResponse } from "next/server";

// The legacy device sign-in flow is retired. Current CLI builds sign in
// through Vana Account (account.vana.org) using its OAuth device grant.
export function GET() {
  return NextResponse.json(
    { error: "This endpoint has been retired. Sign in through Vana Account." },
    { status: 410 },
  );
}
