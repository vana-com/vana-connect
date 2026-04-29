import { createHmac, timingSafeEqual } from "node:crypto";
import type { LoginEvidence } from "./login-session-adapter";

export const ACCOUNT_LOGIN_SESSION_COOKIE = "vana_account_session";
export const ACCOUNT_LOGIN_SESSION_TTL_MS = 15 * 60 * 1000;

type AccountLoginSessionPayload = LoginEvidence & {
  iat: number;
  exp: number;
};

type AccountLoginSessionOptions = {
  secret: string;
  nowMs?: number;
  ttlMs?: number;
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "base64url");
  const right = Buffer.from(b, "base64url");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeEvidence(
  payload: AccountLoginSessionPayload,
): LoginEvidence | null {
  if (typeof payload.privySubject !== "string" || !payload.privySubject) {
    return null;
  }

  const evidence: LoginEvidence = { privySubject: payload.privySubject };
  if (typeof payload.email === "string" || payload.email === null) {
    evidence.email = payload.email;
  }

  if (payload.embeddedWallet !== undefined) {
    if (
      payload.embeddedWallet.chainType !== "evm" ||
      typeof payload.embeddedWallet.address !== "string" ||
      !payload.embeddedWallet.address
    ) {
      return null;
    }
    evidence.embeddedWallet = {
      chainType: "evm",
      address: payload.embeddedWallet.address,
      providerWalletId:
        typeof payload.embeddedWallet.providerWalletId === "string" ||
        payload.embeddedWallet.providerWalletId === null
          ? payload.embeddedWallet.providerWalletId
          : null,
    };
  }

  return evidence;
}

export function resolveAccountLoginSessionSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.ACCOUNT_LOGIN_SESSION_SECRET ?? env.PRIVY_APP_SECRET ?? null;
}

export function createAccountLoginSessionToken(
  evidence: LoginEvidence,
  options: AccountLoginSessionOptions,
): string {
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? ACCOUNT_LOGIN_SESSION_TTL_MS;
  const payload = encodeJson({
    ...evidence,
    iat: nowMs,
    exp: nowMs + ttlMs,
  } satisfies AccountLoginSessionPayload);
  const signed = `v1.${payload}`;
  return `${signed}.${sign(signed, options.secret)}`;
}

export function verifyAccountLoginSessionToken(
  token: string,
  options: Pick<AccountLoginSessionOptions, "secret" | "nowMs">,
): LoginEvidence | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const signed = `${parts[0]}.${parts[1]}`;
  const expected = sign(signed, options.secret);
  if (!safeEqual(parts[2], expected)) return null;

  const payload = decodeJson<AccountLoginSessionPayload>(parts[1]);
  if (!payload) return null;

  const nowMs = options.nowMs ?? Date.now();
  if (
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowMs
  ) {
    return null;
  }

  return normalizeEvidence(payload);
}
