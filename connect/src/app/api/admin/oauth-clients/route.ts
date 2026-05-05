/**
 * Admin API for the `oauth_clients` registry — replaces the localStorage
 * admin store. Authenticated callers must present a Vana session
 * (`getVanaSession(req)`); the resolved `vanaUserId` becomes the registry's
 * canonical owner via `owner_vana_user_id`.
 *
 * GET    /api/admin/oauth-clients          — list clients owned by the caller
 * POST   /api/admin/oauth-clients          — register or upsert a client
 * DELETE /api/admin/oauth-clients/{id}     — delete a client (other route file)
 *
 * The legacy `oauth_clients.owner_address` column is left in place during the
 * PR-Y transition (per docs/auth-redesign/01-architecture.md §10.1) and is
 * populated from the caller's primary linked wallet so the existing CHECK
 * constraint and downstream readers continue to function. Backfill of older
 * rows is a follow-up cleanup PR.
 */

import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import { getVanaSession } from "@/lib/auth/vana-session";
import { findLinkedWalletsByUser } from "@/lib/db/account";
import {
  findOauthClientsByOwnerVanaUserId,
  upsertOauthClient,
} from "@/lib/db/oauth-clients";

export const maxDuration = 30;

async function resolvePrimaryWalletAddress(
  vanaUserId: string,
): Promise<string | null> {
  const wallets = await findLinkedWalletsByUser(vanaUserId);
  const primary = wallets.find((w) => w.is_primary);
  if (primary) return primary.address.toLowerCase();
  const first = wallets[0];
  return first?.address?.toLowerCase() ?? null;
}

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }
  const rows = await findOauthClientsByOwnerVanaUserId(session.vanaUserId);
  return apiSuccess({ object: "list", data: rows });
}

export async function POST(request: NextRequest) {
  const session = await getVanaSession(request);
  if (!session) {
    return apiError("authentication_error", "Not authenticated", 401);
  }

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

  // The legacy NOT NULL `owner_address` column needs a value during the
  // PR-Y transition. Sourced from the caller's primary linked wallet.
  const ownerAddress = await resolvePrimaryWalletAddress(session.vanaUserId);
  if (!ownerAddress) {
    return apiError(
      "invalid_request_error",
      "Caller has no linked wallet to register as owner_address",
      400,
    );
  }

  const row = await upsertOauthClient({
    clientId,
    applicationId: asNonEmptyString(body.applicationId),
    displayName,
    appUrl,
    ownerAddress,
    ownerVanaUserId: session.vanaUserId,
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
