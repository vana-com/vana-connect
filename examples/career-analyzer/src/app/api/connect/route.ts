import { NextResponse } from "next/server";
import { connect } from "@opendatalabs/connect/server";
import { ConnectError } from "@opendatalabs/connect/core";
import { config } from "@/config";

export async function POST() {
  try {
    console.log("[connect] scopes:", config.scopes, "env:", config.environment);
    const result = await connect(config);
    console.log("[connect] session created:", result.sessionId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[connect] error:", err);
    const message =
      err instanceof ConnectError ? err.message : "Failed to create session";
    const status = err instanceof ConnectError ? (err.statusCode ?? 500) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
