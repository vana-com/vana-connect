/**
 * /api/servers
 *
 * Auth-redesign PR-X: route auth swapped from `master-key-signature`-recovery
 * to `getVanaSession()`. The user's primary EVM wallet address is resolved
 * from `vana_linked_wallets` (still the legacy `user_id` semantics on
 * `personal_servers` rows during the transitional window).
 *
 * Provisioning POST still accepts `masterKeySignature` in the body — but
 * for a different reason than auth: PS's startup script needs it as
 * `VANA_MASTER_KEY_SIGNATURE` to deterministically derive its signing
 * keypair so the same user's PS always boots with the same serverAddress.
 * That's a PS-keypair-derivation concern, not authentication, so we keep
 * it in the body. Authentication is now via the Vana session Bearer.
 */

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { findLinkedWalletsByUser } from "@/lib/db/account";
import {
  findServerByUserId,
  insertServerIfNotExists,
  updateServer,
  updateServerControlPlaneToken,
} from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

// Provisioning calls Cloudflare API + GCP API — needs more time than default 15s
export const maxDuration = 60;
export const runtime = "nodejs";

function generateServerId(): string {
  const bytes = crypto.randomBytes(10);
  return `srv_${bytes.toString("base64url")}`;
}

export async function OPTIONS() {
  return apiOptions();
}

async function resolvePrimaryEvmWallet(vanaUserId: string) {
  const wallets = await findLinkedWalletsByUser(vanaUserId);
  return (
    wallets.find((w) => w.is_primary && w.chain_type === "evm") ??
    wallets.find((w) => w.chain_type === "evm") ??
    null
  );
}

export async function GET(request: NextRequest) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  const primary = await resolvePrimaryEvmWallet(session.vanaUserId);
  if (!primary) {
    return apiSuccess({ object: "list", data: [] });
  }

  const server = await findServerByUserId(primary.address.toLowerCase());

  return apiSuccess({
    object: "list",
    data: server ? [toApiServer(server)] : [],
  });
}

export async function POST(request: NextRequest) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  let body: { masterKeySignature?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_request_error", "Invalid JSON body", 400);
  }

  // PS-keypair derivation requires the master-key signature. This is NOT
  // authentication — auth is the Vana session above. The master-key
  // signature is metadata passed to PS so its bootstrap can derive a
  // deterministic keypair.
  const { masterKeySignature } = body;
  if (!masterKeySignature) {
    return apiError(
      "invalid_request_error",
      "Missing masterKeySignature (required for PS keypair derivation)",
      400,
    );
  }

  const primary = await resolvePrimaryEvmWallet(session.vanaUserId);
  if (!primary) {
    return apiError(
      "invalid_request_error",
      "No EVM wallet linked to this user",
      400,
    );
  }

  const userId = primary.address.toLowerCase();
  const ownerAddress = primary.address;

  const existing = await findServerByUserId(userId);
  if (existing) {
    return apiSuccess(toApiServer(existing));
  }

  const serverId = generateServerId();
  const providerName = process.env.SERVER_PROVIDER ?? "gcp";

  const inserted = await insertServerIfNotExists({
    id: serverId,
    user_id: userId,
    provider: providerName,
    state: "provisioning",
  });

  if (!inserted) {
    const raceWinner = await findServerByUserId(userId);
    if (raceWinner) return apiSuccess(toApiServer(raceWinner));
    return apiError("internal_error", "Failed to create server", 500);
  }

  let row = inserted;
  const provider = getServerProvider();

  try {
    const controlPlaneToken = `vana_ps_${crypto.randomBytes(32).toString("hex")}`;

    const result = await provider.provision({
      serverId,
      userId,
      masterKeySignature,
      ownerAddress,
      psAccessToken: controlPlaneToken,
    });

    row =
      (await updateServer(serverId, {
        provider_id: result.serverId,
        url: result.url,
        state: "provisioning",
        tunnel_id: result.tunnelId ?? null,
        dns_record_id: result.dnsRecordId ?? null,
      })) ?? row;

    await updateServerControlPlaneToken(serverId, controlPlaneToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Provisioning error:", msg);
    await updateServer(serverId, { state: "error" });
    return apiError("internal_error", `Provisioning failed: ${msg}`, 500);
  }

  return apiSuccess(toApiServer(row), 201);
}
