/**
 * Credential management for Vana CLI authentication.
 *
 * Stores and retrieves auth credentials from ~/.vana/auth.json.
 * Supports the device code flow for browser-based login and
 * env var overrides for CI/automation.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface VanaCredentials {
  account: {
    address: string;
    session_token: string;
    expires_at: string;
  };
  personal_server: {
    url: string;
    session_token: string;
    expires_at: string;
  } | null;
}

interface LegacyVanaCredentials {
  account: VanaCredentials["account"];
  personal_server: {
    url: string;
    access_token?: string;
    session_token?: string;
    expires_at: string;
  } | null;
}

const AUTH_FILE = "auth.json";

function getAuthFilePath(): string {
  return path.join(os.homedir(), ".vana", AUTH_FILE);
}

function normalizeCredentials(
  creds: LegacyVanaCredentials,
): VanaCredentials | null {
  if (!creds.account || typeof creds.account.session_token !== "string") {
    return null;
  }

  const personalServer = creds.personal_server;

  return {
    account: creds.account,
    personal_server: personalServer
      ? {
          url: personalServer.url,
          session_token:
            personalServer.session_token ?? personalServer.access_token ?? "",
          expires_at: personalServer.expires_at,
        }
      : null,
  };
}

/**
 * Load credentials from disk or env vars.
 *
 * Priority:
 * 1. Env vars (VANA_SESSION_TOKEN, VANA_PS_TOKEN, VANA_PS_URL)
 * 2. File (~/.vana/auth.json)
 *
 * Returns null if no credentials are available or if they are expired.
 */
export function loadCredentials(): VanaCredentials | null {
  // Check env var overrides first
  const envSessionToken = process.env.VANA_SESSION_TOKEN;
  const envPsToken = process.env.VANA_PS_TOKEN;
  const envPsUrl =
    process.env.VANA_PS_URL ?? process.env.VANA_PERSONAL_SERVER_URL;

  if (envSessionToken) {
    // Build credentials from env vars — no expiry tracking for env-based tokens
    const farFuture = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    return {
      account: {
        address: "env",
        session_token: envSessionToken,
        expires_at: farFuture,
      },
      personal_server:
        envPsToken && envPsUrl
          ? {
              url: envPsUrl,
              session_token: envPsToken,
              expires_at: farFuture,
            }
          : null,
    };
  }

  // Read from file
  const filePath = getAuthFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const creds = normalizeCredentials(
      JSON.parse(raw) as LegacyVanaCredentials,
    );
    if (!creds) {
      return null;
    }
    if (isExpired(creds)) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

/**
 * Save credentials to ~/.vana/auth.json with 0600 permissions.
 */
export async function saveCredentials(creds: VanaCredentials): Promise<void> {
  const filePath = getAuthFilePath();
  const dir = path.dirname(filePath);

  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
  });
}

/**
 * Delete ~/.vana/auth.json.
 */
export async function clearCredentials(): Promise<void> {
  const filePath = getAuthFilePath();
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check if the account session token has expired.
 */
export function isExpired(creds: VanaCredentials): boolean {
  try {
    const expiresAt = new Date(creds.account.expires_at);
    return expiresAt.getTime() <= Date.now();
  } catch {
    return true;
  }
}

/**
 * Format an address for display: 0x2Ab3...fa1
 */
export function formatAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-3)}`;
}

function isWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Return human-readable time until expiry: "29 days", "3 hours", etc.
 */
export function formatExpiresIn(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const minutes = Math.floor(ms / (60 * 1000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ── Device code flow ───────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceCodePollAuthorized {
  status: "authorized";
  session_token: string;
  personal_server_url?: string;
  personal_server_session_token?: string;
  ps_access_token?: string;
  address: string;
  expires_in?: number;
  expires_at?: string;
}

export interface DeviceCodePollPending {
  status: "pending";
}

export interface DeviceCodePollSlowDown {
  status: "slow_down";
}

export interface DeviceCodePollExpired {
  status: "expired";
}

export type DeviceCodePollResponse =
  | DeviceCodePollAuthorized
  | DeviceCodePollPending
  | DeviceCodePollSlowDown
  | DeviceCodePollExpired;

function resolveCredentialExpiry(params: {
  expiresAt?: string;
  expiresIn?: number;
}): string {
  if (params.expiresAt) {
    const parsed = new Date(params.expiresAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const expiresIn = params.expiresIn ?? 30 * 24 * 60 * 60;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function getAccountUrl(): string {
  return (
    process.env.VANA_ACCOUNT_URL?.replace(/\/+$/, "") ??
    "https://account.vana.org"
  );
}

/**
 * Request a device code from the auth server.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const url = `${getAccountUrl()}/api/auth/device`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to start device code flow: HTTP ${response.status}${text ? ` — ${text}` : ""}`,
    );
  }

  return (await response.json()) as DeviceCodeResponse;
}

/**
 * Poll for device code authorization.
 */
export async function pollDeviceCode(
  deviceCode: string,
): Promise<DeviceCodePollResponse> {
  const url = `${getAccountUrl()}/api/auth/device/poll?device_code=${encodeURIComponent(deviceCode)}`;
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Poll failed: HTTP ${response.status}${text ? ` — ${text}` : ""}`,
    );
  }

  return (await response.json()) as DeviceCodePollResponse;
}

/**
 * Open a URL in the user's default browser.
 * Best-effort — failures are silently ignored.
 */
export function openBrowser(url: string): void {
  // Use spawnSync with args array to prevent shell injection.
  // A malicious server could return a URL with shell metacharacters.
  const platform = process.platform;

  try {
    const opener =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "start"
          : "xdg-open";
    spawnSync(opener, [url], { stdio: "ignore" });
  } catch {
    // Best-effort — user can open manually
  }
}

/**
 * Run the full device code login flow.
 *
 * Returns credentials on success, or null if the code expired.
 * Calls the provided callbacks for UI updates.
 */
export async function runDeviceCodeFlow(callbacks: {
  onCode: (code: string, verificationUri: string) => void;
  onWaiting: () => void;
  onAuthorized: (creds: VanaCredentials) => void | Promise<void>;
  onExpired: () => void;
  onError: (error: Error) => void;
}): Promise<VanaCredentials | null> {
  try {
    const deviceCode = await requestDeviceCode();

    callbacks.onCode(deviceCode.user_code, deviceCode.verification_uri);

    // Try to open browser
    openBrowser(deviceCode.verification_uri);

    callbacks.onWaiting();

    const interval = (deviceCode.interval ?? 5) * 1000;
    const deadline = Date.now() + deviceCode.expires_in * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const result = await pollDeviceCode(deviceCode.device_code);

        if (result.status === "authorized") {
          const expiresAt = resolveCredentialExpiry({
            expiresAt: result.expires_at,
            expiresIn: result.expires_in,
          });

          const creds: VanaCredentials = {
            account: {
              address: result.address,
              session_token: result.session_token,
              expires_at: expiresAt,
            },
            personal_server:
              result.personal_server_url &&
              (result.personal_server_session_token ?? result.ps_access_token)
                ? {
                    url: result.personal_server_url,
                    session_token:
                      result.personal_server_session_token ??
                      result.ps_access_token ??
                      "",
                    expires_at: expiresAt,
                  }
                : null,
          };

          await callbacks.onAuthorized(creds);
          return creds;
        }

        if (result.status === "expired") {
          callbacks.onExpired();
          return null;
        }

        if (result.status === "slow_down") {
          continue;
        }

        // status === "pending" — continue polling
      } catch {
        // Transient poll error — retry on next interval
      }
    }

    // Timed out
    callbacks.onExpired();
    return null;
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

// ── Self-hosted PS auth (Nextcloud Login Flow v2) ─────────────────────

export type AuthTarget = "cloud" | "self-hosted";

export function getAuthTarget(psUrl: string | null): AuthTarget {
  if (!psUrl) return "cloud";
  if (psUrl.includes(".myvana.app")) return "cloud";
  return "self-hosted";
}

export function resolvePersonalServerUrl(): string | undefined {
  return (
    process.env.VANA_PS_URL ||
    process.env.VANA_PERSONAL_SERVER_URL ||
    loadCredentials()?.personal_server?.url
  );
}

interface LoginV2InitResponse {
  login: string;
  poll: { endpoint: string; token: string };
}

interface LoginV2PollSuccess {
  status: "authorized";
  server: string;
  address: string;
  access_token: string;
  expires_at: string;
}

interface LoginV2PollPending {
  status: "pending";
}

interface LoginV2PollExpired {
  status: "expired";
}

type LoginV2PollResponse =
  | LoginV2PollSuccess
  | LoginV2PollPending
  | LoginV2PollExpired;

const SELF_HOSTED_POLL_INTERVAL_MS = 5_000;

function resolveLoginV2Url(serverUrl: string, endpoint: string): string {
  return new URL(endpoint, `${serverUrl.replace(/\/$/, "")}/`).toString();
}

export async function runSelfHostedLoginFlow(
  serverUrl: string,
  onLoginUrl: (url: string) => void,
): Promise<{
  server: string;
  address: string;
  session_token: string;
  expires_at: string;
}> {
  const base = serverUrl.replace(/\/$/, "");

  // 1. Initiate login flow
  const initRes = await fetch(`${base}/auth/device`, { method: "POST" });
  if (!initRes.ok) {
    throw new Error(
      `Server at ${base} does not support CLI login (${initRes.status})`,
    );
  }
  const init = (await initRes.json()) as LoginV2InitResponse;

  // 2. Open browser
  onLoginUrl(resolveLoginV2Url(base, init.login));

  // 3. Poll for completion (5 min timeout)
  const deadline = Date.now() + 5 * 60 * 1000;
  const pollUrl = resolveLoginV2Url(base, init.poll.endpoint);

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SELF_HOSTED_POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `${pollUrl}?token=${encodeURIComponent(init.poll.token)}`,
    );

    if (pollRes.status === 200) {
      const result = (await pollRes.json()) as LoginV2PollSuccess;
      if (!isWalletAddress(result.address)) {
        throw new Error(
          "Personal Server did not report a valid owner wallet address. Ensure VANA_MASTER_KEY_SIGNATURE is configured.",
        );
      }
      return {
        server: result.server,
        address: result.address,
        session_token: result.access_token,
        expires_at: result.expires_at,
      };
    }

    if (pollRes.status === 404 || pollRes.status === 202) {
      const result = (await pollRes
        .json()
        .catch(() => null)) as LoginV2PollResponse | null;

      if (result?.status === "expired") {
        throw new Error("Authorization expired. Please try again.");
      }

      continue;
    }

    if (pollRes.status === 429) {
      continue;
    }

    if (!pollRes.ok) {
      throw new Error(`Poll failed: ${pollRes.status}`);
    }
  }

  throw new Error("Authorization timed out. Please try again.");
}
