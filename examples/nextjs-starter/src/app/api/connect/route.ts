import { NextResponse } from "next/server";
import { connect } from "@opendatalabs/connect/server";

export async function POST() {
  const privateKey = process.env.VANA_PRIVATE_KEY as `0x${string}`;

  if (!privateKey) {
    return NextResponse.json(
      { error: "Missing env var: VANA_PRIVATE_KEY" },
      { status: 500 },
    );
  }

  const scopes = (process.env.SCOPES ?? "test.dpv1.260130")
    .split(",")
    .map((s) => s.trim());

  const result = await connect({ privateKey, scopes });

  return NextResponse.json(result);
}
