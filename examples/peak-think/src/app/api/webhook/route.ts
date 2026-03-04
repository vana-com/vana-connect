import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const payload = await request.json();

  // TODO: Verify the webhook signature and process the grant notification.
  console.log("[webhook] received:", JSON.stringify(payload));

  return NextResponse.json({ received: true });
}
