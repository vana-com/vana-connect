import type { NextRequest } from "next/server";
import { runActionDecision } from "../../account-actions-runtime";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return runActionDecision(request, id);
}
