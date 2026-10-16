import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { findServerById } from "@/lib/db/neon";
import { registerServerOnChain } from "@/lib/server-provider/register-on-chain";

// Generous timeout — calls PS /health, Privy signing, then gateway /v1/servers.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sig = extractSignature(request);
  if (!sig) {
    return apiError("authentication_error", "Missing masterKeySignature", 401);
  }

  let walletAddress: string;
  try {
    walletAddress = await recoverWalletAddress(sig);
  } catch {
    return apiError("authentication_error", "Invalid signature", 401);
  }

  const server = await findServerById(id);
  if (!server) {
    return apiError("not_found_error", "Server not found", 404);
  }

  if (server.user_id !== walletAddress.toLowerCase()) {
    return apiError("not_found_error", "Server not found", 404);
  }

  if (!server.url) {
    return apiError(
      "invalid_request_error",
      "Server is not running yet — cannot register before /health is reachable",
      400,
    );
  }

  const result = await registerServerOnChain({
    masterKeySignature: sig as `0x${string}`,
    ownerAddress: walletAddress as `0x${string}`,
    serverUrl: server.url,
  });

  if (!result.ok) {
    return apiError(
      "internal_error",
      `On-chain registration failed (${result.error.code}): ${result.error.message}`,
      500,
    );
  }

  return apiSuccess({
    object: "server.registration",
    serverId: result.data.serverId,
    serverAddress: result.data.serverAddress,
  });
}
