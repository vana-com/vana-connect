import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { extractSignature, recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { toApiServer } from "@/lib/api-server";
import {
  failProvisioning,
  findServerByUserId,
  finishProvisioning,
  insertServerIfNotExists,
  recordProvisioningProgress,
} from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

export const maxDuration = 60;

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
  const deadline = Date.now() + (maxDuration - 5) * 1000;
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

  const serverId = `srv_${randomUUID()}`;
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

  let checkpoint = "reserved";
  try {
    const controlPlaneToken = `vana_ps_${randomBytes(32).toString("hex")}`;
    const { url } = await getServerProvider().provision({
      serverId,
      userId,
      masterKeySignature,
      ownerAddress: walletAddress,
      psAccessToken: controlPlaneToken,
      deadline,
      recordProgress: async (progress) => {
        await recordProvisioningProgress(serverId, progress);
        checkpoint = progress.step;
      },
    });
    checkpoint = "finalize";
    const row = await finishProvisioning(serverId, url, controlPlaneToken);
    if (!row) throw new Error("Provisioning attempt is no longer active");
    return apiSuccess(toApiServer(row), 201);
  } catch (err) {
    const failure = err as {
      code?: unknown;
      cfStatus?: unknown;
      cfErrors?: { code?: unknown }[];
    } | null;
    const code = failure?.code ?? failure?.cfErrors?.[0]?.code;
    const httpStatus = failure?.cfStatus;
    console.error(
      `[api/servers POST] serverId=${serverId} provisioning failed`,
      {
        checkpoint,
        code: Number.isInteger(code) ? code : undefined,
        httpStatus: Number.isInteger(httpStatus) ? httpStatus : undefined,
      },
    );
    await failProvisioning(serverId).catch((error) => {
      console.error(
        `[api/servers POST] serverId=${serverId} could not record failure`,
        error,
      );
    });
    return apiError(
      "internal_error",
      "Server setup did not finish. Remove the server to clean it up before trying again.",
      500,
    );
  }
}
