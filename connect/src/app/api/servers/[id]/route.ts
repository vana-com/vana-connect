import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import { findServerById, updateServer } from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

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
  // Once running, return stored state — no unnecessary GCP API calls.
  if (server.state === "provisioning" && server.provider_id) {
    try {
      const provider = getServerProvider();
      const liveStatus = await provider.status(server.provider_id);

      if (liveStatus.state !== server.state) {
        await updateServer(id, { state: liveStatus.state });
        return apiSuccess({
          ...toApiServer(server),
          state: liveStatus.state,
        });
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

  if (server.provider_id) {
    try {
      const provider = getServerProvider();
      await provider.deprovision(server.provider_id, {
        tunnelId: server.tunnel_id ?? undefined,
        dnsRecordId: server.dns_record_id ?? undefined,
      });
    } catch (err) {
      console.error("Deprovision error:", err);
      await updateServer(id, { state: "deprovision_failed" });
      return apiError(
        "internal_error",
        "Failed to deprovision server. Resources may still be running.",
        500,
      );
    }
  }

  const diskExpires = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  await updateServer(id, {
    state: "stopped",
    disk_expires: diskExpires,
  });

  return apiSuccess({
    object: "server",
    id,
    state: "stopped",
    disk_expires: diskExpires,
  });
}
