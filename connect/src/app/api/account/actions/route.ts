import type { NextRequest } from "next/server";
import { runCreateActionRequest } from "./account-actions-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return runCreateActionRequest(request);
}
