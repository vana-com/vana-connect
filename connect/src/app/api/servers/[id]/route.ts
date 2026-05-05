/**
 * /api/servers/:id
 *
 * Auth-redesign PR-X: route auth swapped to `getVanaSession()`.
 * Ownership is checked via the resolved primary EVM wallet (server.user_id
 * is currently a lowercased address; the new vanaUserId path is also
 * accepted for forward-compat).
 */

import type { NextRequest } from "next/server";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import { getVanaSession } from "@/lib/auth/vana-session";
import { findLinkedWalletsByUser } from "@/lib/db/account";
import { deleteServer, findServerById, updateServer } from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

// Allow up to 60s — DELETE waits for the GCE VM delete operation to
// complete before deleting the persistent data disk.
export const maxDuration = 60;
export const runtime = "nodejs";

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

function ownsServer(
  server: { user_id: string },
  vanaUserId: string,
  primaryAddressLower: string | null,
): boolean {
  if (server.user_id === vanaUserId) return true;
  if (primaryAddressLower && server.user_id === primaryAddressLower)
    return true;
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  const { id } = await params;
  const primary = await resolvePrimaryEvmWallet(session.vanaUserId);
  const primaryAddressLower = primary?.address.toLowerCase() ?? null;

  const server = await findServerById(id);
  if (!server || !ownsServer(server, session.vanaUserId, primaryAddressLower)) {
    return apiError("not_found_error", "Server not found", 404);
  }

  // Live-check only while provisioning to detect transition to running.
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
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

  const { id } = await params;
  const primary = await resolvePrimaryEvmWallet(session.vanaUserId);
  const primaryAddressLower = primary?.address.toLowerCase() ?? null;

  const server = await findServerById(id);
  if (!server || !ownsServer(server, session.vanaUserId, primaryAddressLower)) {
    return apiError("not_found_error", "Server not found", 404);
  }

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

  await deleteServer(id);

  return apiSuccess({
    object: "server",
    id,
    deleted: true,
    state: "deleted",
  });
}
