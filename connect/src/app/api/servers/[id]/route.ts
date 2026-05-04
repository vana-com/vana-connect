import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import { deleteServer, findServerById, updateServer } from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

// Allow up to 60s — DELETE waits for the GCE VM delete operation to
// complete before deleting the persistent data disk, which can take
// 15-30s on its own. GET only does a fast status read.
export const maxDuration = 60;

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
  // Once running, return stored state — no unnecessary API calls.
  // Skips the health check to stay within Vercel function timeout.
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

  // Always run cleanup if we have any provider-side state recorded —
  // VM, tunnel, or DNS — so retry from `deprovision_failed` works.
  if (server.provider_id || server.tunnel_id || server.dns_record_id) {
    try {
      const provider = getServerProvider();
      await provider.deprovision(server.provider_id ?? "", {
        tunnelId: server.tunnel_id,
        dnsRecordId: server.dns_record_id,
      });
    } catch (err) {
      const errorName = err instanceof Error ? err.name : "Error";
      const errorMessage = err instanceof Error ? err.message : String(err);
      const deprovisionErrors = (
        err as Error & {
          deprovisionErrors?: { step: string; code: number; message: string }[];
        }
      ).deprovisionErrors;
      console.error(
        `[api/servers DELETE] serverId=${id} providerId=${server.provider_id ?? ""} tunnelId=${server.tunnel_id ?? ""} dnsRecordId=${server.dns_record_id ?? ""} ${errorName}: ${errorMessage}`,
      );
      await updateServer(id, { state: "deprovision_failed" });
      // Return the actual failure detail in the response body so it's visible
      // without runtime-log access. This is admin/control-plane data; nothing
      // here is secret (just step names + GCP/Cloudflare error messages).
      return apiError(
        "internal_error",
        `Failed to deprovision server: ${errorMessage}${
          deprovisionErrors?.length
            ? ` [steps: ${deprovisionErrors
                .map((e) => `${e.step}(code=${e.code})`)
                .join(", ")}]`
            : ""
        }`,
        500,
      );
    }
  }

  // Provider deprovision destroys VM + tunnel + DNS + data disk. There's
  // nothing left to recover, so drop the row entirely. The UI then shows
  // "Provision Server" (idle) instead of a misleading "Stopped" with a
  // dead public endpoint.
  await deleteServer(id);

  return apiSuccess({
    object: "server",
    id,
    deleted: true,
    state: "deleted",
  });
}
