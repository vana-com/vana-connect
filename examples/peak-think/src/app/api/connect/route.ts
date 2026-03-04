import { NextResponse } from "next/server";
import { connect } from "@opendatalabs/connect/server";
import { ConnectError } from "@opendatalabs/connect/core";
import { config } from "@/config";

export async function POST(request: Request) {
  try {
    const { scopes } = (await request.json()) as { scopes: string[] };

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json(
        { error: "scopes must be a non-empty array" },
        { status: 400 },
      );
    }

    const result = await connect({
      privateKey: config.privateKey,
      scopes,
      appUrl: config.appUrl,
      environment: config.environment,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[connect] error:", err);
    const message =
      err instanceof ConnectError ? err.message : "Failed to create session";
    const status = err instanceof ConnectError ? (err.statusCode ?? 500) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
