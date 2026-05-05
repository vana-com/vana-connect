/**
 * POST /api/servers/:id/register-on-chain
 *
 * Auth-redesign PR-X: route auth swapped from `master-key-signature` to
 * `getVanaSession()`. Internal signing now flows through the Vana wallet
 * API (`wallet.signTypedData`) which is high-risk and may require an
 * interactive confirmation from the user.
 *
 * Auth: Bearer (Vana session). State-mutating; cookie-only requests are
 *       rejected by the verifier.
 *
 * Optional header `x-vana-confirmation-id`: when retrying after the user
 * has consumed an interactive_confirmations row, the client sends the row
 * id here so wallet.signTypedData can mint the signature.
 *
 * On `confirmation_required` from wallet.signTypedData: the route returns
 * `401 { error: 'confirmation_required', confirmation_id, payload_summary,
 * expires_at }` — the client mounts the inline modal, calls
 * /api/auth/confirmations/:id/consume, then retries this route with
 * x-vana-confirmation-id.
 *
 * See docs/auth-redesign/01-architecture.md §6.1 (browser flow) and §10.2
 * (PR-X migration).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { getVanaSession } from "@/lib/auth/vana-session";
import { findLinkedWalletsByUser } from "@/lib/db/account";
import { findServerById } from "@/lib/db/neon";
import { registerServerOnChain } from "@/lib/server-provider/register-on-chain";

// Generous timeout — calls PS /health, signs typed data, then gateway /v1/servers.
export const maxDuration = 30;
export const runtime = "nodejs";

export async function OPTIONS() {
  return apiOptions();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  const { id } = await params;
  const confirmationId =
    request.headers.get("x-vana-confirmation-id") ?? undefined;

  // Resolve the user's primary EVM wallet for ownerAddress.
  const wallets = await findLinkedWalletsByUser(session.vanaUserId);
  const primary =
    wallets.find((w) => w.is_primary && w.chain_type === "evm") ??
    wallets.find((w) => w.chain_type === "evm");
  if (!primary) {
    return apiError(
      "invalid_request_error",
      "No EVM wallet linked to this user",
      400,
    );
  }

  const server = await findServerById(id);
  if (!server) {
    return apiError("not_found_error", "Server not found", 404);
  }

  // Transitional ownership check: server.user_id is currently a lowercased
  // EVM address (legacy). Match against the user's primary wallet address.
  // After the personal_servers migration finishes, this comparison shifts
  // to session.vanaUserId.
  const ownsByLegacyAddress = server.user_id === primary.address.toLowerCase();
  const ownsByVanaUserId = server.user_id === session.vanaUserId;
  if (!ownsByLegacyAddress && !ownsByVanaUserId) {
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
    vanaUserId: session.vanaUserId,
    hydraSessionId: session.hydraSessionId,
    ownerAddress: primary.address as `0x${string}`,
    serverUrl: server.url,
    confirmationId,
  });

  if (!result.ok) {
    if (result.error.code === "CONFIRMATION_REQUIRED") {
      // 401 carries the inline-modal envelope. The client's useConfirmation
      // hook handles it by rendering the modal and retrying.
      return NextResponse.json(
        {
          error: "confirmation_required",
          confirmation_id: result.error.confirmationId,
          payload_summary: result.error.payloadSummary,
          expires_at: result.error.expiresAt,
        },
        { status: 401 },
      );
    }
    if (result.error.code === "WALLET_NOT_SUPPORTED") {
      return apiError("invalid_request_error", result.error.message, 400);
    }
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
