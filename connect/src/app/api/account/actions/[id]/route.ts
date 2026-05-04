import type { NextRequest } from "next/server";
import { runGetActionRequest } from "../account-actions-runtime";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runGetActionRequest(request, id);
}
