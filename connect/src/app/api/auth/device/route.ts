import crypto from "node:crypto";
import { apiOptions, apiSuccess } from "@/lib/api-error";
import { createDeviceCode } from "@/lib/db/neon";

const DEVICE_CODE_TTL_SECONDS = 300; // 5 minutes
const POLL_INTERVAL_SECONDS = 5;

/** Characters that avoid ambiguity (no 0/O, 1/I/L) */
const USER_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateUserCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function OPTIONS() {
  return apiOptions();
}

export async function POST() {
  const deviceCode = crypto.randomBytes(32).toString("hex");
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

  await createDeviceCode(deviceCode, userCode, expiresAt);

  return apiSuccess({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: "https://account.vana.org/auth/device",
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  });
}
