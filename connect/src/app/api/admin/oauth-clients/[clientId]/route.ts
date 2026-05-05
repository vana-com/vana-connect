import type { NextRequest } from "next/server";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { getVanaSession } from "@/lib/auth/vana-session";
import { deleteOauthClient, findOauthClientById } from "@/lib/db/oauth-clients";

export const maxDuration = 30;

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const row = await findOauthClientById(clientId);
  if (!row) {
    return apiError("not_found_error", "OAuth client not found", 404);
  }
  return apiSuccess(row);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  const { clientId } = await params;
  const existing = await findOauthClientById(clientId);
  if (!existing) {
    return apiError("not_found_error", "OAuth client not found", 404);
  }
  if (existing.owner_vana_user_id !== session.vanaUserId) {
    // 404 (not 403) to avoid leaking existence to non-owners.
    return apiError("not_found_error", "OAuth client not found", 404);
  }

  const removed = await deleteOauthClient(clientId);
  if (!removed) {
    return apiError("not_found_error", "OAuth client not found", 404);
  }
  return apiSuccess({ object: "oauth_client.deleted", clientId });
}
