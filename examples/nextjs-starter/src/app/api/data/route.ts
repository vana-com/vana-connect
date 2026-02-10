import { NextResponse } from "next/server";
import { getData } from "@opendatalabs/connect/server";

export async function POST(request: Request) {
  const privateKey = process.env.VANA_PRIVATE_KEY as `0x${string}`;

  if (!privateKey) {
    return NextResponse.json(
      { error: "Missing env var: VANA_PRIVATE_KEY" },
      { status: 500 },
    );
  }

  const { grant } = await request.json();

  if (!grant?.grantId || !grant?.userAddress || !grant?.scopes?.length) {
    return NextResponse.json(
      { error: "Missing required grant fields: grantId, userAddress, scopes" },
      { status: 400 },
    );
  }

  const data = await getData({ privateKey, grant });

  return NextResponse.json({ data: Object.fromEntries(data) });
}
