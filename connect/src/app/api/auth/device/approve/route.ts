import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { recoverWalletAddress } from "@/lib/api-auth";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import {
  approveDeviceCode,
  createSession,
  findDeviceCodeByUserCode,
  findServerByUserId,
} from "@/lib/db/neon";
import { provisionPersonalServerSessionToken } from "@/lib/auth/personal-server-session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function OPTIONS() {
  return apiOptions();
}

export async function POST(request: NextRequest) {
  let body: { user_code?: string; masterKeySignature?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_request_error", "Invalid JSON body", 400);
  }

  const { user_code, masterKeySignature } = body;

  if (!user_code) {
    return apiError("invalid_request_error", "Missing user_code", 400);
  }
  if (!masterKeySignature) {
    return apiError("authentication_error", "Missing masterKeySignature", 401);
  }

  // Recover wallet address from signature
  let walletAddress: string;
  try {
    walletAddress = await recoverWalletAddress(masterKeySignature);
  } catch {
    return apiError("authentication_error", "Invalid signature", 401);
  }

  // Normalize: uppercase, strip whitespace, insert dash if missing (ABCD1234 → ABCD-1234)
  let normalizedCode = user_code.toUpperCase().replace(/[\s-]+/g, "");
  if (normalizedCode.length === 8 && !normalizedCode.includes("-")) {
    normalizedCode = `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4)}`;
  }

  // Find the pending device code
  const deviceCodeRecord = await findDeviceCodeByUserCode(normalizedCode);
  if (!deviceCodeRecord) {
    return apiError(
      "not_found_error",
      "Invalid or expired code. Please try again.",
      404,
    );
  }

  // Check expiry
  if (new Date(deviceCodeRecord.expires_at) < new Date()) {
    return apiError(
      "invalid_request_error",
      "Code has expired. Please request a new one.",
      400,
    );
  }

  // Generate session token
  const sessionToken = `vana_sess_${crypto.randomBytes(32).toString("hex")}`;
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Look up the user's personal server. The stored access_token is the
  // control-plane credential used by account.vana.org to provision a fresh
  // CLI session token into the running Personal Server.
  const userId = walletAddress.toLowerCase();
  const server = await findServerByUserId(userId);
  let psAccessToken: string | null = null;

  if (server?.url) {
    if (!server.access_token) {
      return apiError(
        "internal_error",
        "Personal Server control-plane token missing",
        500,
      );
    }

    try {
      psAccessToken = await provisionPersonalServerSessionToken({
        serverUrl: server.url,
        controlPlaneToken: server.access_token,
        expiresAt: sessionExpiresAt,
      });
    } catch (error) {
      return apiError(
        "internal_error",
        error instanceof Error
          ? error.message
          : "Failed to provision Personal Server session token",
        500,
      );
    }
  }

  // Create the session
  await createSession(sessionToken, userId, psAccessToken, sessionExpiresAt);

  // Mark the device code as authorized
  const approved = await approveDeviceCode(
    normalizedCode,
    userId,
    sessionToken,
  );

  if (!approved) {
    return apiError("conflict_error", "Code was already used or expired", 409);
  }

  return apiSuccess({ status: "approved" });
}
