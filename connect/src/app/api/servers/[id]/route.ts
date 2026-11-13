import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { extractSignature, recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import {
  claimServerCleanup,
  findServerById,
  finishServerCleanup,
  releaseServerCleanup,
  saveRecoveryHandles,
  updateProvisionedServerStatus,
} from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

// Allow up to 60s — DELETE waits for the GCE VM delete operation to
// complete before deleting the persistent data disk, which can take
// 15-30s on its own. GET only does a fast status read.
export const maxDuration = 60;

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(
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

  // Live-check only while provisioning (to detect transition to running).
  // Once running, return stored state — no unnecessary API calls.
  // Skips the health check to stay within Vercel function timeout.
  if (
    server.state === "provisioning" &&
    !server.provisioning_step &&
    server.provider_id
  ) {
    try {
      const provider = getServerProvider();
      const liveStatus = await provider.status(
        server.provider_id,
        server.compute_operation,
      );

      if (liveStatus.state !== server.state) {
        const updated = await updateProvisionedServerStatus(
          id,
          liveStatus.state,
        );
        const current = updated ?? (await findServerById(id));
        return current
          ? apiSuccess(toApiServer(current))
          : apiError("not_found_error", "Server not found", 404);
      }
    } catch (err) {
      console.error("Live status check failed:", err);
    }
  }

  return apiSuccess(toApiServer(server));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cleanupDeadline = Date.now() + (maxDuration - 5) * 1000;
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

  const claim = randomUUID();
  const target = await claimServerCleanup(id, claim);
  if (!target) {
    return apiError(
      "conflict_error",
      "Server setup or cleanup is still in progress. Try removing it again shortly.",
      409,
    );
  }

  try {
    if (
      !target.provisioning_step &&
      (!target.provider_id ||
        (!target.url && (!target.tunnel_id || !target.dns_record_id)))
    ) {
      throw new Error(
        "This older attempt has incomplete ownership records. Contact support to verify and remove its resources.",
      );
    }
    if (target.provisioning_step !== "reserved") {
      const provider = getServerProvider();
      await provider.recoverProvisioning(target, cleanupDeadline, (handles) =>
        saveRecoveryHandles(id, claim, handles),
      );
    }
    if (!(await finishServerCleanup(id, claim))) {
      throw new Error("Cleanup claim expired. Try removing the server again.");
    }
  } catch (err) {
    await releaseServerCleanup(id, claim).catch((error) => {
      console.error(
        `[api/servers DELETE] serverId=${id} could not release cleanup claim`,
        error,
      );
    });
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/servers DELETE] serverId=${id} cleanup failed: ${message}`,
    );
    return apiError(
      "internal_error",
      `Failed to deprovision server: ${message}`,
      500,
    );
  }

  return apiSuccess({
    object: "server",
    id,
    deleted: true,
    state: "deleted",
  });
}
