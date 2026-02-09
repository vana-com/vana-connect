import { NextResponse } from "next/server";
import { createSessionRelay } from "../../../../../src/server/session-relay.js";

export async function POST() {
  const relayUrl = process.env.SESSION_RELAY_URL;
  const privateKey = process.env.BUILDER_PRIVATE_KEY as `0x${string}`;
  const granteeAddress = process.env.GRANTEE_ADDRESS as `0x${string}`;
  const scopes = (process.env.SCOPES ?? "test.data.read")
    .split(",")
    .map((s) => s.trim());

  if (!relayUrl || !privateKey || !granteeAddress) {
    return NextResponse.json(
      {
        error:
          "Missing env vars: SESSION_RELAY_URL, BUILDER_PRIVATE_KEY, GRANTEE_ADDRESS",
      },
      { status: 500 },
    );
  }

  const relay = createSessionRelay({
    sessionRelayUrl: relayUrl,
    privateKey,
    granteeAddress,
  });

  const result = await relay.initSession({ scopes });

  return NextResponse.json({
    sessionId: result.sessionId,
    deepLinkUrl: result.deepLinkUrl,
    expiresAt: result.expiresAt,
    relayUrl,
  });
}
