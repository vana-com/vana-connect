// Fetches user data from their Personal Server using an approved grant.

import { NextResponse } from "next/server";
import { getData } from "@opendatalabs/connect/server";
import { ConnectError, isValidGrant } from "@opendatalabs/connect/core";
import { config } from "@/config";

export async function POST(request: Request) {
  const { grant } = await request.json();

  if (!isValidGrant(grant)) {
    return NextResponse.json(
      { error: "Invalid grant payload" },
      { status: 400 },
    );
  }

  try {
    const data = await getData({
      privateKey: config.privateKey,
      grant,
      environment: config.environment,
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message =
      err instanceof ConnectError ? err.message : "Failed to fetch data";
    const status = err instanceof ConnectError ? (err.statusCode ?? 500) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
