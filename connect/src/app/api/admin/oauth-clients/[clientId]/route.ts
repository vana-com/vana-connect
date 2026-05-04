import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { deleteOauthClient, findOauthClientById } from "@/lib/db/oauth-clients";

export const maxDuration = 30;

function extractSignature(request: NextRequest): string | null {
  return (
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("masterKeySignature")
  );
}

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
  const sig = extractSignature(request);
  if (!sig) {
    return apiError("authentication_error", "Missing masterKeySignature", 401);
  }
  let walletAddress: string;
  try {
    walletAddress = (await recoverWalletAddress(sig)).toLowerCase();
  } catch {
    return apiError("authentication_error", "Invalid signature", 401);
  }

  const { clientId } = await params;
  const existing = await findOauthClientById(clientId);
  if (!existing) {
    return apiError("not_found_error", "OAuth client not found", 404);
  }
  if (existing.owner_address !== walletAddress) {
    // 404 (not 403) to avoid leaking existence to non-owners.
    return apiError("not_found_error", "OAuth client not found", 404);
  }

  const removed = await deleteOauthClient(clientId);
  if (!removed) {
    return apiError("not_found_error", "OAuth client not found", 404);
  }
  return apiSuccess({ object: "oauth_client.deleted", clientId });
}
