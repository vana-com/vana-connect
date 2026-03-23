import type { NextRequest } from "next/server";
import { apiError, apiOptions, apiSuccess } from "@/lib/api-error";
import {
  findDeviceCode,
  findServerByUserId,
  findSession,
  updateDeviceCodeLastPolled,
} from "@/lib/db/neon";

const MIN_POLL_INTERVAL_MS = 5000; // 5 seconds

export async function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  const deviceCode = request.nextUrl.searchParams.get("device_code");

  if (!deviceCode) {
    return apiError(
      "invalid_request_error",
      "Missing device_code parameter",
      400,
    );
  }

  const record = await findDeviceCode(deviceCode);

  if (!record) {
    return apiError("not_found_error", "Device code not found", 404);
  }

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    return apiSuccess({ status: "expired" });
  }

  // Rate limiting: check last_polled_at
  if (record.last_polled_at) {
    const elapsed = Date.now() - new Date(record.last_polled_at).getTime();
    if (elapsed < MIN_POLL_INTERVAL_MS) {
      return apiSuccess({ status: "slow_down" });
    }
  }

  // Update last polled timestamp
  await updateDeviceCodeLastPolled(deviceCode);

  if (record.status === "pending") {
    return apiSuccess({ status: "pending" });
  }

  if (record.status === "authorized" && record.session_token) {
    const session = await findSession(record.session_token);
    if (!session) {
      return apiError("internal_error", "Session not found", 500);
    }

    // Look up personal server URL
    const walletAddress = record.wallet_address?.toLowerCase();
    let personalServerUrl: string | null = null;
    let personalServerSessionToken: string | null = null;

    if (walletAddress) {
      const server = await findServerByUserId(walletAddress);
      if (server) {
        personalServerUrl = server.url;
        personalServerSessionToken = session.personal_server_session_token;
      }
    }

    return apiSuccess({
      status: "authorized",
      address: session.wallet_address,
      session_token: session.token,
      personal_server_url: personalServerUrl,
      personal_server_session_token: personalServerSessionToken,
      // Legacy alias for older CLI builds.
      ps_access_token: personalServerSessionToken,
      expires_at: session.expires_at,
    });
  }

  return apiSuccess({ status: "expired" });
}
