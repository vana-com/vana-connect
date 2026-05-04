/**
 * Admin API for the `oauth_clients` registry — replaces the localStorage
 * admin store. Authenticated callers must present a master-key signature
 * (proves wallet ownership) and become the registry's `owner_address`.
 *
 * GET  /api/admin/oauth-clients          — list clients owned by the caller
 * POST /api/admin/oauth-clients          — register or upsert a client
 * DELETE /api/admin/oauth-clients/{id}   — delete a client (other route file)
 */

import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import {
  findOauthClientsByOwner,
  upsertOauthClient,
} from "@/lib/db/oauth-clients";

export const maxDuration = 30;

function extractSignature(request: NextRequest): string | null {
  return (
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("masterKeySignature")
  );
}

async function authenticate(
  request: NextRequest,
): Promise<{ ok: true; ownerAddress: string } | { ok: false; res: Response }> {
  const sig = extractSignature(request);
  if (!sig) {
    return {
      ok: false,
      res: apiError("authentication_error", "Missing masterKeySignature", 401),
    };
  }
  try {
    const ownerAddress = await recoverWalletAddress(sig);
    return { ok: true, ownerAddress: ownerAddress.toLowerCase() };
  } catch {
    return {
      ok: false,
      res: apiError("authentication_error", "Invalid signature", 401),
    };
  }
}

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.res;
  const rows = await findOauthClientsByOwner(auth.ownerAddress);
  return apiSuccess({ object: "list", data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.res;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("invalid_request_error", "Invalid JSON body", 400);
  }

  const clientId = asNonEmptyString(body.clientId);
  if (!clientId) {
    return apiError("invalid_request_error", "clientId is required", 400);
  }

  const displayName = asNonEmptyString(body.displayName);
  if (!displayName) {
    return apiError("invalid_request_error", "displayName is required", 400);
  }

  const appUrl = asNonEmptyString(body.appUrl);
  if (!appUrl || !/^https?:\/\//.test(appUrl)) {
    return apiError("invalid_request_error", "appUrl must be http(s) URL", 400);
  }

  const redirectUrisRaw = body.redirectUris;
  const redirectUris =
    Array.isArray(redirectUrisRaw) &&
    redirectUrisRaw.every((u) => typeof u === "string")
      ? (redirectUrisRaw as string[])
      : [];

  // Builder fields are optional but all-or-nothing (same constraint the DB
  // enforces). If any is provided, all three must be.
  const granteeAddress = asNonEmptyString(body.granteeAddress);
  const builderId = asNonEmptyString(body.builderId);
  const publicKey = asNonEmptyString(body.publicKey);
  const anyBuilderField =
    granteeAddress !== null || builderId !== null || publicKey !== null;
  const allBuilderFields =
    granteeAddress !== null && builderId !== null && publicKey !== null;
  if (anyBuilderField && !allBuilderFields) {
    return apiError(
      "invalid_request_error",
      "granteeAddress, builderId, and publicKey must be provided together",
      400,
    );
  }
  if (granteeAddress && !isAddress(granteeAddress)) {
    return apiError(
      "invalid_request_error",
      "granteeAddress must be a valid Ethereum address",
      400,
    );
  }
  if (builderId && !/^0x[a-fA-F0-9]{64}$/.test(builderId)) {
    return apiError(
      "invalid_request_error",
      "builderId must be 0x-prefixed 32-byte hex",
      400,
    );
  }
  if (publicKey && !/^0x04[a-fA-F0-9]{128}$/.test(publicKey)) {
    return apiError(
      "invalid_request_error",
      "publicKey must be 0x04-prefixed uncompressed",
      400,
    );
  }

  const row = await upsertOauthClient({
    clientId,
    applicationId: asNonEmptyString(body.applicationId),
    displayName,
    appUrl,
    ownerAddress: auth.ownerAddress,
    granteeAddress,
    builderId,
    publicKey,
    webhookUrl: asNonEmptyString(body.webhookUrl),
    redirectUris,
  });

  return apiSuccess(row, 201);
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
