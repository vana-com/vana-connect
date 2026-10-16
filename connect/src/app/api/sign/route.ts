import { NextResponse } from "next/server";

// This route used to sign caller-supplied ServerRegistration /
// ServerDeregistration typed data with the user's embedded wallet for anyone
// holding the master key signature, with open CORS. That made it a signing
// oracle for a credential that is easy to leak, so it is retired. Hosted
// server registration signs in-process (lib/privy-signer.ts), and current
// desktop and CLI builds sign through Vana Account instead.
export function POST() {
  return NextResponse.json(
    { error: "This endpoint has been retired." },
    { status: 410 },
  );
}
