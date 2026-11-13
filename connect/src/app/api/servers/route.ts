import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { extractSignature, recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import {
  findServerByUserId,
  insertServerIfNotExists,
  updateServer,
  updateServerControlPlaneToken,
} from "@/lib/db/neon";
import {
  getServerProvider,
  type ProvisionResult,
  type ServerProvider,
} from "@/lib/server-provider";

// Provisioning calls Cloudflare API + GCP API — needs more time than default 15s
export const maxDuration = 60;

function generateServerId(): string {
  const bytes = crypto.randomBytes(10);
  return `srv_${bytes.toString("base64url")}`;
}

/**
 * Deprovision the resources a create request just made after its row was
 * deleted underneath it. Never throws: it answers for the request either way.
 * When cleanup fails there is no row to mark `deprovision_failed`, so the log
 * line and the response body are the only record of the leaked ids.
 */
async function removeOrphanedProvision(
  provider: ServerProvider,
  serverId: string,
  result: ProvisionResult,
  cleanupDeadline: number,
) {
  const handles = `serverId=${serverId} providerId=${result.serverId} tunnelId=${result.tunnelId ?? ""} dnsRecordId=${result.dnsRecordId ?? ""}`;
  console.info(`[api/servers POST] Cleaning up after deletion: ${handles}`);
  try {
    await provider.deprovision(result.serverId, {
      tunnelId: result.tunnelId,
      dnsRecordId: result.dnsRecordId,
      deadline: cleanupDeadline,
    });
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "Error";
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/servers POST] ${handles} ${errorName}: ${errorMessage}`,
    );
    return apiError(
      "internal_error",
      `Server was deleted during setup and cleanup failed, so these resources must be removed by hand: ${handles}. ${errorMessage}`,
      500,
    );
  }

  return apiError(
    "conflict_error",
    "Server was deleted during setup. The resources created for it have been removed.",
    409,
  );
}

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
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

  const server = await findServerByUserId(walletAddress.toLowerCase());

  return apiSuccess({
    object: "list",
    data: server ? [toApiServer(server)] : [],
  });
}

export async function POST(request: NextRequest) {
  const cleanupDeadline = Date.now() + (maxDuration - 5) * 1000;
  let body: { masterKeySignature?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_request_error", "Invalid JSON body", 400);
  }

  const { masterKeySignature } = body;
  if (!masterKeySignature) {
    return apiError("authentication_error", "Missing masterKeySignature", 401);
  }

  let walletAddress: string;
  try {
    walletAddress = await recoverWalletAddress(masterKeySignature);
  } catch {
    return apiError("authentication_error", "Invalid signature", 401);
  }

  const userId = walletAddress.toLowerCase();

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
    // Generate the per-server control-plane token used for hosted management.
    const controlPlaneToken = `vana_ps_${crypto.randomBytes(32).toString("hex")}`;

    const result = await provider.provision({
      serverId,
      userId,
      masterKeySignature,
      ownerAddress: walletAddress,
      psAccessToken: controlPlaneToken,
    });

    const updated = await updateServer(serverId, {
      provider_id: result.serverId,
      url: result.url,
      state: "provisioning",
      tunnel_id: result.tunnelId ?? null,
      dns_record_id: result.dnsRecordId ?? null,
    });

    // A signed DELETE that arrives while provision() is pending finds no
    // provider handles, skips cleanup and removes the row. Then there is no
    // row to attach what we just created to, so remove it here instead of
    // reporting success for a server nothing tracks.
    if (!updated) {
      return await removeOrphanedProvision(
        provider,
        serverId,
        result,
        cleanupDeadline,
      );
    }
    row = updated;

    // Store the control-plane token separately since it's not in the updateServer allowlist.
    await updateServerControlPlaneToken(serverId, controlPlaneToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Provisioning error:", msg);
    await updateServer(serverId, { state: "error" });
    return apiError("internal_error", `Provisioning failed: ${msg}`, 500);
  }

  return apiSuccess(toApiServer(row), 201);
}
