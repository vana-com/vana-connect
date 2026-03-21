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

  const apiServer = toApiServer(server);
  if (server.provider_id) {
    try {
      const provider = getServerProvider();
      const liveStatus = await provider.status(server.provider_id);

      const dbUpdates: Record<string, string | null> = {};
      if (liveStatus.state !== server.state) dbUpdates.state = liveStatus.state;
      if (liveStatus.url && liveStatus.url !== server.url)
        dbUpdates.url = liveStatus.url;

      if (Object.keys(dbUpdates).length > 0) {
        await updateServer(id, dbUpdates);
      }

      return apiSuccess({
        ...apiServer,
        state: liveStatus.state,
        url: liveStatus.url ?? apiServer.url,
        health: liveStatus.health ?? null,
      });
    } catch (err) {
      console.error("Status check error:", err);
    }
  }

  return apiSuccess(apiServer);
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
    }
  }

  const diskExpires = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  await updateServer(id, {
    state: "stopped",
    vm_ip: null,
    disk_expires: diskExpires,
  });

  return apiSuccess({
    object: "server",
    id,
    state: "stopped",
    disk_expires: diskExpires,
  });
}
