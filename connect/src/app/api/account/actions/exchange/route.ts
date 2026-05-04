import type { NextRequest } from "next/server";
import { runExchangeActionCode } from "../account-actions-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return runExchangeActionCode(request);
}
