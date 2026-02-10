import { NextResponse } from "next/server";
import { createDataClient } from "@opendatalabs/connect/server";

export async function POST(request: Request) {
  const privateKey = process.env.BUILDER_PRIVATE_KEY as `0x${string}`;
  const gatewayUrl = process.env.GATEWAY_URL;

  if (!privateKey || !gatewayUrl) {
    return NextResponse.json(
      { error: "Missing env vars: BUILDER_PRIVATE_KEY, GATEWAY_URL" },
      { status: 500 },
    );
  }

  const { userAddress, serverAddress, grantId, scopes } = await request.json();

  if (!userAddress || !grantId || !scopes?.length) {
    return NextResponse.json(
      { error: "Missing required fields: userAddress, grantId, scopes" },
      { status: 400 },
    );
  }

  const dataClient = createDataClient({ privateKey, gatewayUrl });

  // Resolve using serverAddress (gateway indexes by server key) with
  // userAddress as fallback for backwards compatibility.
  const serverUrl = await dataClient.resolveServerUrl(
    serverAddress || userAddress,
  );

  const results: Record<string, unknown> = {};
  for (const scope of scopes) {
    const data = await dataClient.fetchData({ serverUrl, scope, grantId });
    results[scope] = data;
  }

  return NextResponse.json({ serverUrl, data: results });
}
