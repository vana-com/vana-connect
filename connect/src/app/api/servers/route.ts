import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import {
  findServerByUserId,
  insertServerIfNotExists,
  updateServer,
} from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

function generateServerId(): string {
  const bytes = crypto.randomBytes(10);
  return `srv_${bytes.toString("base64url")}`;
}

function extractSignature(request: NextRequest): string | null {
  return (
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("masterKeySignature")
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
    const result = await provider.provision({
      serverId,
      userId,
      masterKeySignature,
      ownerAddress: walletAddress,
    });

    row =
      (await updateServer(serverId, {
        provider_id: result.serverId,
        url: result.url,
        state: "provisioning",
        tunnel_id: result.tunnelId ?? null,
        dns_record_id: result.dnsRecordId ?? null,
      })) ?? row;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Provisioning error:", msg);
    await updateServer(serverId, { state: "error" });
    return apiError("internal_error", `Provisioning failed: ${msg}`, 500);
  }

  return apiSuccess(toApiServer(row), 201);
}
